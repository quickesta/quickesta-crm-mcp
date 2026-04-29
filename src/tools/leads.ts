/**
 * Lead management MCP tools for Quickesta CRM.
 * Covers: list, get, create, update, delete, soft-delete, restore, stats,
 * followup, history, duplicates, extended fields.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'
import { buildWhere, buildSet, sanitize } from '../utils.js'

export function createLeadTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── List ──
    {
      name: 'crm_leads_list',
      description: 'List leads with filters. Supports status, source, date range, search, assigned member, pagination.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Product/tenant ID (required)' },
          status: { type: 'string', description: 'NEW_LEAD, TRIAL, HIGH_POTENTIAL, LOW_POTENTIAL, SUCCESS_LEAD, REJECTED, IN_FOLLOW_UP, SUSPENDED, RETURNING_LEAD' },
          source: { type: 'string', description: 'INSTAGRAM, WHATSAPP, CALL, MAIL, WEBSITE, CONFERENCE, REFERENCE, YOUTUBE, GOOGLE_ADS, WEBINAR, DIGER' },
          search: { type: 'string', description: 'Search name, email, or phone' },
          assigned_member_id: { type: 'string', description: 'Assigned member UUID' },
          affiliate_id: { type: 'string', description: 'Affiliate UUID' },
          created_after: { type: 'string', description: 'ISO date' },
          created_before: { type: 'string', description: 'ISO date' },
          include_deleted: { type: 'boolean', description: 'Include soft-deleted (default: false)' },
          limit: { type: 'number', description: 'Max results (default: 50, max: 200)' },
          offset: { type: 'number', description: 'Pagination offset' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const w: string[] = [`product_id: {_eq: "${sanitize(args.product_id as string)}"}`]
        if (args.status) w.push(`sell_status: {_eq: "${sanitize(args.status as string)}"}`)
        if (args.source) w.push(`source: {_eq: "${sanitize(args.source as string)}"}`)
        if (args.assigned_member_id) w.push(`assigned_member_id: {_eq: "${sanitize(args.assigned_member_id as string)}"}`)
        if (args.affiliate_id) w.push(`affiliate_id: {_eq: "${sanitize(args.affiliate_id as string)}"}`)
        if (args.created_after) w.push(`created_at: {_gte: "${sanitize(args.created_after as string)}"}`)
        if (args.created_before) w.push(`created_at: {_lte: "${sanitize(args.created_before as string)}"}`)
        if (args.search) {
          const s = sanitize(args.search as string)
          w.push(`_or: [{name: {_ilike: "%${s}%"}}, {email: {_ilike: "%${s}%"}}, {phone: {_ilike: "%${s}%"}}]`)
        }
        if (!args.include_deleted) w.push(`is_deleted: {_eq: false}`)
        const limit = Math.min(Number(args.limit) || 50, 200)
        const offset = Number(args.offset) || 0
        const where = w.join(', ')

        return hasura.query({
          query: `{
            leads(where: {${where}}, limit: ${limit}, offset: ${offset}, order_by: {created_at: desc}) {
              id name phone email country_code source lead_message sell_status
              assigned_member_id assigned_note affiliate_id trial_duration trial_start_date
              rejection_reason is_deleted created_at
            }
            leads_aggregate(where: {${where}}) { aggregate { count } }
          }`,
        })
      },
    },

    // ── Get Single ──
    {
      name: 'crm_leads_get',
      description: 'Get one lead with calls, payments, extended fields, and history.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Product/tenant ID (required)' },
          lead_id: { type: 'string', description: 'Lead UUID (required)' },
        },
        required: ['product_id', 'lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `{
            leads(where: {id: {_eq: "${sanitize(args.lead_id as string)}"}, product_id: {_eq: "${sanitize(args.product_id as string)}"}}) {
              id name phone email country_code source lead_message sell_status
              assigned_member_id assigned_note affiliate_id trial_duration trial_start_date
              rejection_reason is_deleted created_at
              calls(order_by: {created_at: desc}, limit: 20) {
                id call_status call_result call_notes call_duration
                follow_up_date follow_up_notes follow_up_call_time
                called_by is_important tags created_at
              }
              payments(order_by: {created_at: desc}) {
                id name total_amount note created_at
                payment_details(order_by: {due_date: asc}) {
                  id due_date amount paid_amount status payment_type payment_date
                }
                payment_discounts { id discount_type discount_value discount_reason }
              }
              extended_field_values { id field_id module_id value }
            }
          }`,
        })
      },
    },

    // ── Create ──
    {
      name: 'crm_leads_create',
      description: 'Create a new lead.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Product/tenant ID (required)' },
          name: { type: 'string', description: 'Lead name (required)' },
          phone: { type: 'string' }, email: { type: 'string' },
          country_code: { type: 'number', description: 'Default: 90' },
          source: { type: 'string', description: 'INSTAGRAM, WHATSAPP, CALL, etc.' },
          lead_message: { type: 'string' },
          sell_status: { type: 'string', description: 'Default: NEW_LEAD' },
          assigned_member_id: { type: 'string' }, affiliate_id: { type: 'string' },
          trial_duration: { type: 'number' },
        },
        required: ['product_id', 'name'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: leads_insert_input!) {
            insert_leads_one(object: $input) {
              id name phone email sell_status source created_at
            }
          }`,
          variables: { input: args },
        })
      },
    },

    // ── Update ──
    {
      name: 'crm_leads_update',
      description: 'Update a lead — status, assignment, contact info, etc.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (required)' },
          name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' },
          sell_status: { type: 'string' }, assigned_member_id: { type: 'string' },
          assigned_note: { type: 'string' }, lead_message: { type: 'string' },
          rejection_reason: { type: 'string' }, trial_duration: { type: 'number' },
          trial_start_date: { type: 'string' },
        },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { lead_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: leads_set_input!) {
            update_leads_by_pk(pk_columns: {id: "${sanitize(lead_id as string)}"}, _set: $set) {
              id name phone email sell_status source assigned_member_id created_at
            }
          }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete (hard) ──
    {
      name: 'crm_leads_delete',
      description: 'Permanently delete a lead.',
      inputSchema: {
        type: 'object' as const,
        properties: { lead_id: { type: 'string', description: 'Lead UUID (required)' } },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation { delete_leads_by_pk(id: "${sanitize(args.lead_id as string)}") { id name } }`,
        })
      },
    },

    // ── Soft Delete ──
    {
      name: 'crm_leads_soft_delete',
      description: 'Soft-delete a lead (sets is_deleted=true, recoverable).',
      inputSchema: {
        type: 'object' as const,
        properties: { lead_id: { type: 'string', description: 'Lead UUID (required)' } },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation {
            update_leads_by_pk(pk_columns: {id: "${sanitize(args.lead_id as string)}"}, _set: {is_deleted: true}) {
              id name is_deleted
            }
          }`,
        })
      },
    },

    // ── Restore ──
    {
      name: 'crm_leads_restore',
      description: 'Restore a soft-deleted lead.',
      inputSchema: {
        type: 'object' as const,
        properties: { lead_id: { type: 'string', description: 'Lead UUID (required)' } },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation {
            update_leads_by_pk(pk_columns: {id: "${sanitize(args.lead_id as string)}"}, _set: {is_deleted: false}) {
              id name is_deleted
            }
          }`,
        })
      },
    },

    // ── Update Status ──
    {
      name: 'crm_leads_update_status',
      description: 'Quick status change for a lead.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (required)' },
          sell_status: { type: 'string', description: 'New status (required)' },
        },
        required: ['lead_id', 'sell_status'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation {
            update_leads_by_pk(pk_columns: {id: "${sanitize(args.lead_id as string)}"}, _set: {sell_status: "${sanitize(args.sell_status as string)}"}) {
              id name sell_status
            }
          }`,
        })
      },
    },

    // ── Stats ──
    {
      name: 'crm_leads_stats',
      description: 'Lead statistics — count by status, source, conversion rate.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Product/tenant ID (required)' },
          created_after: { type: 'string', description: 'ISO date' },
          created_before: { type: 'string', description: 'ISO date' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const df: string[] = []
        if (args.created_after) df.push(`created_at: {_gte: "${sanitize(args.created_after as string)}"}`)
        if (args.created_before) df.push(`created_at: {_lte: "${sanitize(args.created_before as string)}"}`)
        const dw = df.length ? `, ${df.join(', ')}` : ''
        const pid = sanitize(args.product_id as string)

        return hasura.query({
          query: `{
            total: leads_aggregate(where: {product_id: {_eq: "${pid}"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            new_lead: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "NEW_LEAD"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            trial: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "TRIAL"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            high_potential: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "HIGH_POTENTIAL"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            in_follow_up: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "IN_FOLLOW_UP"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            success: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "SUCCESS_LEAD"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            rejected: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "REJECTED"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            suspended: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "SUSPENDED"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            returning: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "RETURNING_LEAD"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            by_instagram: leads_aggregate(where: {product_id: {_eq: "${pid}"}, source: {_eq: "INSTAGRAM"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            by_whatsapp: leads_aggregate(where: {product_id: {_eq: "${pid}"}, source: {_eq: "WHATSAPP"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            by_website: leads_aggregate(where: {product_id: {_eq: "${pid}"}, source: {_eq: "WEBSITE"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            by_call: leads_aggregate(where: {product_id: {_eq: "${pid}"}, source: {_eq: "CALL"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            by_reference: leads_aggregate(where: {product_id: {_eq: "${pid}"}, source: {_eq: "REFERENCE"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
            by_google_ads: leads_aggregate(where: {product_id: {_eq: "${pid}"}, source: {_eq: "GOOGLE_ADS"}, is_deleted: {_eq: false}${dw}}) { aggregate { count } }
          }`,
        })
      },
    },

    // ── Followup Overdue ──
    {
      name: 'crm_leads_followup_overdue',
      description: 'Leads with overdue follow-up dates.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Product/tenant ID (required)' },
          limit: { type: 'number', description: 'Max results (default: 50)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const today = new Date().toISOString().split('T')[0]
        return hasura.query({
          query: `{
            calls(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}, follow_up_date: {_lte: "${today}", _is_null: false}}, order_by: {follow_up_date: asc}, limit: ${Math.min(Number(args.limit) || 50, 200)}) {
              id lead_id follow_up_date follow_up_notes follow_up_call_time call_status call_result called_by created_at
              lead { id name phone email sell_status source }
            }
          }`,
        })
      },
    },

    // ── History ──
    {
      name: 'crm_leads_history',
      description: 'Get change history/audit trail for a lead.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Product/tenant ID (required)' },
          lead_id: { type: 'string', description: 'Lead UUID (required)' },
        },
        required: ['product_id', 'lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `{
            lead_history(where: {lead_id: {_eq: "${sanitize(args.lead_id as string)}"}, product_id: {_eq: "${sanitize(args.product_id as string)}"}}, order_by: {changed_at: desc}) {
              id lead_id field_name old_value new_value changed_by changed_at
            }
          }`,
        })
      },
    },

    // ── Check Duplicate ──
    {
      name: 'crm_leads_check_duplicate',
      description: 'Check if a lead with given phone or email already exists.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Product/tenant ID (required)' },
          phone: { type: 'string' }, email: { type: 'string' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const or: string[] = []
        if (args.phone) or.push(`{phone: {_eq: "${sanitize(args.phone as string)}"}}`)
        if (args.email) or.push(`{email: {_eq: "${sanitize(args.email as string)}"}}`)
        if (!or.length) return { error: 'Provide phone or email' }

        return hasura.query({
          query: `{
            leads(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}, _or: [${or.join(', ')}]}) {
              id name phone email sell_status created_at
            }
          }`,
        })
      },
    },

    // ── Extended Field Values ──
    {
      name: 'crm_leads_extended_fields_get',
      description: 'Get extended/custom field values for a lead.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (required)' },
        },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `{
            extended_field_values(where: {record_id: {_eq: "${sanitize(args.lead_id as string)}"}, record_type: {_eq: "lead"}}) {
              id field_id module_id value created_at
              module_field { field_name field_key field_type }
            }
          }`,
        })
      },
    },

    // ── Save Extended Field Values ──
    {
      name: 'crm_leads_extended_fields_save',
      description: 'Save/update extended field values for a lead.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          values: {
            type: 'array',
            description: 'Array of {record_id, record_type: "lead", module_id, field_id, value}',
            items: { type: 'object' },
          },
        },
        required: ['values'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($values: [extended_field_values_insert_input!]!) {
            insert_extended_field_values(objects: $values, on_conflict: {constraint: extended_field_values_record_id_record_type_module_id_field_id_key, update_columns: [value]}) {
              returning { id record_id field_id value }
            }
          }`,
          variables: { values: args.values },
        })
      },
    },

    // ── Leads by IDs ──
    {
      name: 'crm_leads_get_by_ids',
      description: 'Get multiple leads by their IDs.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Product/tenant ID (required)' },
          lead_ids: { type: 'array', items: { type: 'string' }, description: 'Array of lead UUIDs' },
        },
        required: ['product_id', 'lead_ids'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($ids: [uuid!]!) {
            leads(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}, id: {_in: $ids}}) {
              id name phone email sell_status source assigned_member_id created_at
            }
          }`,
          variables: { ids: args.lead_ids },
        })
      },
    },
  ]
}
