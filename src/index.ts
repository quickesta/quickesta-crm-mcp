#!/usr/bin/env node

/**
 * Quickesta CRM MCP Server
 *
 * Multi-tenant CRM data exposed to AI assistants via MCP.
 * API key authentication — each key is scoped to specific product_ids.
 * Keys are managed from Cloud Dashboard (quickesta.cloud).
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

if (!HASURA_SECRET) {
  console.error('HATA: HASURA_ADMIN_SECRET gerekli')
  process.exit(1)
}
if (!CLOUD_HASURA_SECRET) {
  console.error('HATA: CLOUD_HASURA_SECRET gerekli (API key doğrulama için)')
  process.exit(1)
}

// --- Initialize ---

const hasura = new HasuraClient({
  url: HASURA_URL,
  adminSecret: HASURA_SECRET,
})

const auth = new McpAuth({
  cloudHasuraUrl: CLOUD_HASURA_URL,
  cloudHasuraSecret: CLOUD_HASURA_SECRET,
})

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

/** Validate API key and cache allowed product IDs for this session */
async function ensureAuth(apiKey: string): Promise<void> {
  if (sessionAllowedProductIds !== null) return // already validated

  const result = await auth.validate(apiKey)
  if (!result.valid) {
    throw new Error(result.error || 'Yetkilendirme başarısız')
  }
  sessionAllowedProductIds = result.allowedProductIds
  console.error(`✓ API key doğrulandı. Yetkili ürünler: ${sessionAllowedProductIds.length}`)
}

/** Check product_id authorization */
function checkProductAccess(args: Record<string, unknown>): void {
  if (!sessionAllowedProductIds) {
    throw new Error('API key henüz doğrulanmadı')
  }

  const productId = args.product_id as string | undefined
  if (!productId) return // some tools don't need product_id (e.g. expense_categories)

  if (!sessionAllowedProductIds.includes(productId)) {
    throw new Error(`Bu ürüne erişim yetkiniz yok: ${productId}`)
  }
}

// --- MCP Server ---

const server = new Server(
  { name: 'quickesta-crm', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const tool = toolMap.get(name)

  if (!tool) {
    return { content: [{ type: 'text', text: `Bilinmeyen tool: ${name}` }], isError: true }
  }

  try {
    // Ensure auth on first tool call (STDIO mode)
    if (TRANSPORT === 'stdio' && MCP_API_KEY) {
      await ensureAuth(MCP_API_KEY)
    }

    // Check product_id authorization
    checkProductAccess(args ?? {})

    const result = await tool.handler(args ?? {})
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: `Hata: ${message}` }], isError: true }
  }
})

// --- Start ---

async function main() {
  if (TRANSPORT === 'http') {
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
    const { createServer } = await import('http')

    const httpServer = createServer(async (req, res) => {
      // Health check
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', tools: allTools.length }))
        return
      }

      // MCP endpoint with API key auth
      if (req.url === '/mcp' && req.method === 'POST') {
        const apiKey = (req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '')) as string
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

        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        await server.connect(transport)
        await transport.handleRequest(req, res)
        return
      }

      res.writeHead(404)
      res.end('Bulunamadı')
    })

    httpServer.listen(PORT, () => {
      console.log(`Quickesta CRM MCP Server (HTTP) — port ${PORT}`)
      console.log(`  Sağlık: http://localhost:${PORT}/health`)
      console.log(`  MCP:    http://localhost:${PORT}/mcp`)
      console.log(`  Araçlar: ${allTools.length}`)
      console.log(`  Yetkilendirme: x-api-key header ile`)
    })
  } else {
    if (!MCP_API_KEY) {
      console.error('UYARI: MCP_API_KEY ayarlanmadı. İlk tool çağrısında hata alınacak.')
    }
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error(`Quickesta CRM MCP Server (STDIO) — ${allTools.length} araç`)
  }
}

main().catch((error) => {
  console.error('Kritik hata:', error)
  process.exit(1)
})
