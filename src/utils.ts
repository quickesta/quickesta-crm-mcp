/**
 * Utility types and helpers for Quickesta CRM MCP Server.
 */

/** Build date strings for common time ranges */
export function getDateRanges() {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const yearStart = `${now.getFullYear()}-01-01`
  return { today, tomorrow, weekEnd, monthStart, yearStart, now: now.toISOString() }
}
