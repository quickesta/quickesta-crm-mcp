#!/usr/bin/env node

/**
 * Quickesta CRM MCP Server
 *
 * Multi-tenant CRM data exposed to AI assistants via MCP.
 * API key authentication — each key is scoped to specific product_ids.
 *
 * KEY FEATURE: product_id is auto-resolved from API key.
 * If the key has 1 product → auto-selected, user never sees product_id.
 * If the key has N products → user picks from list (or AI picks).
 *
 * Environment variables:
 *   HASURA_GRAPHQL_URL       — CRM Hasura endpoint (required)
 *   HASURA_ADMIN_SECRET      — Admin secret for CRM Hasura (required)
 *   CLOUD_HASURA_URL         — Cloud Hasura for API key validation (required)
 *   CLOUD_HASURA_SECRET      — Cloud Hasura admin secret (required)
 *   MCP_API_KEY              — API key for STDIO mode (required in stdio)
 *   TRANSPORT                — "stdio" (default) or "http"
 *   PORT                     — HTTP port (default: 4800)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { HasuraClient } from './hasura-client.js'
import { McpAuth } from './auth.js'
import { createLeadTools } from './tools/leads.js'
import { createCallTools } from './tools/calls.js'
import { createPaymentTools } from './tools/payments.js'
import { createMemberTools } from './tools/members.js'
import { createModuleTools } from './tools/modules.js'
import { createAutomationTools } from './tools/automation.js'
import { createExpenseTools } from './tools/expenses.js'
import { createFileAndMiscTools } from './tools/files.js'
import type { ToolDefinition } from './types.js'

// --- Config ---

const HASURA_URL = process.env.HASURA_GRAPHQL_URL || 'https://graphql-crm.quickesta.com/v1/graphql'
const HASURA_SECRET = process.env.HASURA_ADMIN_SECRET || ''
const CLOUD_HASURA_URL = process.env.CLOUD_HASURA_URL || 'https://graphql-dashboard.quickesta.com/v1/graphql'
const CLOUD_HASURA_SECRET = process.env.CLOUD_HASURA_SECRET || ''
const MCP_API_KEY = process.env.MCP_API_KEY || ''
const TRANSPORT = process.env.TRANSPORT || 'stdio'
const PORT = Number(process.env.PORT) || 4800

if (!HASURA_SECRET) { console.error('HATA: HASURA_ADMIN_SECRET gerekli'); process.exit(1) }
if (!CLOUD_HASURA_SECRET) { console.error('HATA: CLOUD_HASURA_SECRET gerekli'); process.exit(1) }

// --- Initialize ---

const hasura = new HasuraClient({ url: HASURA_URL, adminSecret: HASURA_SECRET })
const auth = new McpAuth({ cloudHasuraUrl: CLOUD_HASURA_URL, cloudHasuraSecret: CLOUD_HASURA_SECRET })

const allTools: ToolDefinition[] = [
  ...createLeadTools(hasura),
  ...createCallTools(hasura),
  ...createPaymentTools(hasura),
  ...createMemberTools(hasura),
  ...createModuleTools(hasura),
  ...createAutomationTools(hasura),
  ...createExpenseTools(hasura),
  ...createFileAndMiscTools(hasura),
]

const toolMap = new Map(allTools.map((t) => [t.name, t]))

// --- Auth state per session ---

let sessionAllowedProductIds: string[] | null = null
let sessionProductNames: Record<string, string> = {}

async function ensureAuth(apiKey: string): Promise<void> {
  const result = await auth.validate(apiKey)
  if (!result.valid) throw new Error(result.error || 'Yetkilendirme başarısız')

  sessionAllowedProductIds = result.allowedProductIds

  // Fetch product names only once
  if (Object.keys(sessionProductNames).length > 0) return

  try {
    const nameData = await hasura.query<{ leads: Array<{ product_id: string }> }>({
      query: `{ ${result.allowedProductIds.map((pid, i) =>
        `p${i}: leads(where: {product_id: {_eq: "${pid}"}}, limit: 1) { product_id }`
      ).join(' ')} }`,
    })
    // We'll also get product info from Cloud Hasura
    const cloudData = await fetch(CLOUD_HASURA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity',
        'x-hasura-admin-secret': CLOUD_HASURA_SECRET,
      },
      body: JSON.stringify({
        query: `query($ids: [uuid!]!) {
          products(where: {id: {_in: $ids}}) { id name product_type { code name } }
        }`,
        variables: { ids: result.allowedProductIds },
      }),
    })
    const cloudJson = await cloudData.text().then(t => { try { return JSON.parse(t) } catch { return null } })
    if (cloudJson?.data?.products) {
      for (const p of cloudJson.data.products) {
        sessionProductNames[p.id] = `${p.name} (${p.product_type?.name || p.product_type?.code || ''})`
      }
    }
  } catch { /* non-critical */ }

  const count = sessionAllowedProductIds.length
  console.error(`✓ Doğrulandı. ${count} yetkili ürün.`)
}

/** Resolve product_id: auto if single product, check if multi */
function resolveProductId(args: Record<string, unknown>): Record<string, unknown> {
  if (!sessionAllowedProductIds) throw new Error('Doğrulama yapılmadı')

  // If product_id already provided, validate it
  if (args.product_id) {
    if (!sessionAllowedProductIds.includes(args.product_id as string)) {
      throw new Error(`Bu ürüne erişim yetkiniz yok: ${args.product_id}`)
    }
    return args
  }

  // Auto-resolve: if only 1 product, use it automatically
  if (sessionAllowedProductIds.length === 1) {
    return { ...args, product_id: sessionAllowedProductIds[0] }
  }

  // Multiple products, product_id not provided — return helpful error
  const productList = sessionAllowedProductIds
    .map(pid => `  • ${pid} — ${sessionProductNames[pid] || 'Bilinmeyen'}`)
    .join('\n')

  throw new Error(
    `Birden fazla ürününüz var. Lütfen product_id belirtin:\n${productList}`
  )
}

// --- MCP Server Factory ---

function createMcpServer(): Server {
  const s = new Server(
    { name: 'quickesta-crm', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  s.setRequestHandler(ListToolsRequestSchema, async () => {
    if (TRANSPORT === 'stdio' && MCP_API_KEY && !sessionAllowedProductIds) {
      try { await ensureAuth(MCP_API_KEY) } catch { /* will fail on tool call */ }
    }

    const isSingleProduct = sessionAllowedProductIds?.length === 1
    const autoNote = isSingleProduct ? ' (product_id otomatik — belirtmenize gerek yok)' : ''

    const myProductsTool = {
      name: 'crm_my_products',
      description: 'Yetkili olduğunuz CRM ürünlerini listeler.',
      inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    }

    return {
      tools: [
        myProductsTool,
        ...allTools.map((t) => ({
          name: t.name,
          description: t.description + autoNote,
          inputSchema: {
            ...t.inputSchema,
            properties: {
              ...t.inputSchema.properties,
              ...(t.inputSchema.properties.product_id && isSingleProduct
                ? { product_id: { ...(t.inputSchema.properties.product_id as object), description: 'Otomatik — belirtmenize gerek yok' } }
                : {}),
            },
            required: isSingleProduct
              ? (t.inputSchema.required || []).filter(r => r !== 'product_id')
              : t.inputSchema.required,
          },
        })),
      ],
    }
  })

  s.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      if (TRANSPORT === 'stdio' && MCP_API_KEY) {
        await ensureAuth(MCP_API_KEY)
      }

      if (name === 'crm_my_products') {
        if (!sessionAllowedProductIds) return { content: [{ type: 'text', text: 'Henüz doğrulanmadı' }], isError: true }
        const result = {
          products: sessionAllowedProductIds.map(pid => ({ product_id: pid, name: sessionProductNames[pid] || 'Bilinmeyen' })),
          count: sessionAllowedProductIds.length,
          note: sessionAllowedProductIds.length === 1
            ? 'Tek ürününüz var — product_id otomatik kullanılacak, belirtmenize gerek yok.'
            : 'Birden fazla ürününüz var — tool çağrılarında product_id belirtmeniz gerekebilir.',
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }

      const tool = toolMap.get(name)
      if (!tool) {
        return { content: [{ type: 'text', text: `Bilinmeyen tool: ${name}` }], isError: true }
      }

      const resolvedArgs = resolveProductId(args ?? {})
      const result = await tool.handler(resolvedArgs)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Hata: ${message}` }], isError: true }
    }
  })

  return s
}

// --- Start ---

async function main() {
  if (TRANSPORT === 'http') {
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
    const { createServer } = await import('http')

    // Session management: map sessionId → { server, transport }
    const sessions = new Map<string, { server: Server; transport: InstanceType<typeof StreamableHTTPServerTransport> }>()

    const httpServer = createServer(async (req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', tools: allTools.length + 1, sessions: sessions.size }))
        return
      }

      // Handle all /mcp methods (POST for requests, GET for SSE, DELETE for close)
      if (req.url?.startsWith('/mcp')) {
        const apiKey = (req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '')) as string

        if (req.method === 'POST') {
          if (!apiKey) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'API key gerekli. x-api-key header gönderin.' }))
            return
          }

          try {
            await ensureAuth(apiKey)
          } catch (err) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Yetkilendirme başarısız' }))
            return
          }

          // Check for existing session
          const sessionId = req.headers['mcp-session-id'] as string | undefined
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!
            await session.transport.handleRequest(req, res)
            return
          }

          // New session
          const mcpServer = createMcpServer()
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          })

          transport.onclose = () => {
            const sid = (transport as any).sessionId
            if (sid) sessions.delete(sid)
            mcpServer.close()
          }

          await mcpServer.connect(transport)
          await transport.handleRequest(req, res)

          // Store session after first request (transport now has sessionId)
          const newSessionId = (transport as any).sessionId
          if (newSessionId) {
            sessions.set(newSessionId, { server: mcpServer, transport })
          }
          return
        }

        if (req.method === 'GET') {
          // SSE stream for existing session
          const sessionId = req.headers['mcp-session-id'] as string | undefined
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!
            await session.transport.handleRequest(req, res)
            return
          }
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Geçersiz veya eksik session ID' }))
          return
        }

        if (req.method === 'DELETE') {
          const sessionId = req.headers['mcp-session-id'] as string | undefined
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!
            await session.transport.handleRequest(req, res)
            sessions.delete(sessionId)
            session.server.close()
            return
          }
          res.writeHead(200)
          res.end()
          return
        }
      }

      res.writeHead(404)
      res.end('Bulunamadı')
    })

    httpServer.listen(PORT, () => {
      console.log(`Quickesta CRM MCP Server (HTTP) — port ${PORT}`)
      console.log(`  Sağlık: http://localhost:${PORT}/health`)
      console.log(`  MCP:    http://localhost:${PORT}/mcp`)
      console.log(`  Araçlar: ${allTools.length + 1} (${allTools.length} CRM + 1 meta)`)
    })
  } else {
    if (!MCP_API_KEY) {
      console.error('UYARI: MCP_API_KEY ayarlanmadı.')
    }
    const stdioServer = createMcpServer()
    const transport = new StdioServerTransport()
    await stdioServer.connect(transport)
    console.error(`Quickesta CRM MCP Server (STDIO) — ${allTools.length + 1} araç`)
  }
}

main().catch((error) => {
  console.error('Kritik hata:', error)
  process.exit(1)
})
