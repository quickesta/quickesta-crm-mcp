/**
 * Hasura GraphQL client for Quickesta CRM.
 * All queries are scoped by product_id for multi-tenant isolation.
 */

interface HasuraConfig {
  url: string
  adminSecret: string
}

interface QueryOptions {
  query: string
  variables?: Record<string, unknown>
}

export class HasuraClient {
  private config: HasuraConfig

  constructor(config: HasuraConfig) {
    this.config = config
  }

  async query<T = unknown>(options: QueryOptions): Promise<T> {
    const res = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'identity',
        'x-hasura-admin-secret': this.config.adminSecret,
      },
      body: JSON.stringify({
        query: options.query,
        variables: options.variables,
      }),
    })

    const text = await res.text()
    let json: { data?: T; errors?: Array<{ message: string }> }
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`Invalid response from Hasura (status ${res.status}): ${text.slice(0, 200)}`)
    }

    if (json.errors) {
      throw new Error(json.errors.map((e) => e.message).join(', '))
    }

    return json.data as T
  }
}
