/**
 * Utility functions for Quickesta CRM MCP Server.
 */

/** Sanitize string for GraphQL inline usage — prevent injection */
export function sanitize(val: string): string {
  return String(val).replace(/[\\"]/g, '')
}

/** Build Hasura where clause fragments from args */
export function buildWhere(
  base: Record<string, unknown>,
  mappings: Record<string, string>
): string[] {
  const parts: string[] = []
  for (const [argKey, hasuraPath] of Object.entries(mappings)) {
    const val = base[argKey]
    if (val === undefined || val === null) continue
    parts.push(`${hasuraPath}: {_eq: "${sanitize(String(val))}"}`)
  }
  return parts
}

/** Build Hasura _set object string from updates */
export function buildSet(updates: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string') parts.push(`${key}: "${sanitize(value)}"`)
    else if (typeof value === 'number') parts.push(`${key}: ${value}`)
    else if (typeof value === 'boolean') parts.push(`${key}: ${value}`)
  }
  return parts.join(', ')
}
