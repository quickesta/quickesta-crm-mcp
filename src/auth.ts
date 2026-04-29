/**
 * API Key authentication and product_id authorization for CRM MCP.
 *
 * Flow:
 * 1. Client sends API key in env/header
 * 2. We hash it and look up in Cloud Hasura's mcp_api_keys table
 * 3. Check is_active
 * 4. Get scoped_product_ids — these are the ONLY product_ids this key can access
 * 5. Every tool call checks product_id against this allowlist
 */

import { createHash } from 'crypto'

interface McpApiKeyRecord {
  id: string
  organization_id: number
  name: string
  scoped_product_ids: string[]
  is_active: boolean
}

interface AuthConfig {
  cloudHasuraUrl: string
  cloudHasuraSecret: string
}

export class McpAuth {
  private config: AuthConfig
  private cachedKey: { hash: string; record: McpApiKeyRecord; cachedAt: number } | null = null
  private readonly CACHE_TTL_MS = 30 * 1000 // 30 seconds

  constructor(config: AuthConfig) {
    this.config = config
  }

  /** Hash API key with SHA-256 */
  static hashKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex')
  }

  /** Extract prefix for quick lookup */
  static keyPrefix(apiKey: string): string {
    return apiKey.slice(0, 8)
  }

  /** Generate a new API key */
  static generateKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let key = 'qk_'
    for (let i = 0; i < 45; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return key
  }

  /** Validate API key and return allowed product_ids */
  async validate(apiKey: string): Promise<{ valid: boolean; allowedProductIds: string[]; error?: string }> {
    if (!apiKey) {
      return { valid: false, allowedProductIds: [], error: 'API key gerekli' }
    }

    const hash = McpAuth.hashKey(apiKey)

    // Check cache
    if (this.cachedKey && this.cachedKey.hash === hash && Date.now() - this.cachedKey.cachedAt < this.CACHE_TTL_MS) {
      if (!this.cachedKey.record.is_active) {
        return { valid: false, allowedProductIds: [], error: 'API key deaktif edilmiş' }
      }
      return { valid: true, allowedProductIds: this.cachedKey.record.scoped_product_ids }
    }

    // Query Cloud Hasura
    try {
      const res = await fetch(this.config.cloudHasuraUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'identity',
          'x-hasura-admin-secret': this.config.cloudHasuraSecret,
        },
        body: JSON.stringify({
          query: `query($hash: String!) {
            mcp_api_keys(where: {api_key_hash: {_eq: $hash}}, limit: 1) {
              id organization_id name scoped_product_ids is_active
            }
          }`,
          variables: { hash },
        }),
      })

      const text = await res.text()
      let json: { data?: { mcp_api_keys: McpApiKeyRecord[] } }
      try {
        json = JSON.parse(text)
      } catch {
        return { valid: false, allowedProductIds: [], error: 'Auth sunucusu yanıt hatası' }
      }

      const record = json.data?.mcp_api_keys?.[0]
      if (!record) {
        return { valid: false, allowedProductIds: [], error: 'Geçersiz API key' }
      }

      if (!record.is_active) {
        return { valid: false, allowedProductIds: [], error: 'API key deaktif edilmiş' }
      }

      // Cache it
      this.cachedKey = { hash, record, cachedAt: Date.now() }

      // Update last_used_at (fire and forget)
      fetch(this.config.cloudHasuraUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': this.config.cloudHasuraSecret,
        },
        body: JSON.stringify({
          query: `mutation($id: uuid!) {
            update_mcp_api_keys_by_pk(pk_columns: {id: $id}, _set: {last_used_at: "now()"}, _inc: {usage_count: 1}) { id }
          }`,
          variables: { id: record.id },
        }),
      }).catch(() => {})

      return { valid: true, allowedProductIds: record.scoped_product_ids }
    } catch (err) {
      return { valid: false, allowedProductIds: [], error: `Auth hatası: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  /** Check if a product_id is allowed for the current key */
  isProductAllowed(productId: string, allowedProductIds: string[]): boolean {
    return allowedProductIds.includes(productId)
  }
}
