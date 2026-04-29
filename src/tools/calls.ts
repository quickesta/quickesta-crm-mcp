/**
 * Call and call template MCP tools.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'
import { sanitize } from '../utils.js'

export function createCallTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── List Calls ──
    {
      name: 'crm_calls_list',
      description: 'List call records with filters on lead, status, result, caller, follow-up.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Product/tenant ID (required)' },
          lead_id: { type: 'string' },
          call_status: { type: 'string', description: 'ANSWERED, NO_ANSWER, BUSY, WRONG_NUMBER, VOICEMAIL' },
          call_result: { type: 'string', description: 'NONE, SUCCESS, PARTIAL_SUCCESS, FAILED, RESCHEDULED' },
          called_by: { type: 'string', description: 'Member UUID' },
          has_followup: { type: 'boolean' },
          created_after: { type: 'string' },
          limit: { type: 'number' }, offset: { type: 'number' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const w: string[] = [`product_id: {_eq: "${sanitize(args.product_id as string)}"}`]
        if (args.lead_id) w.push(`lead_id: {_eq: "${sanitize(args.lead_id as string)}"}`)
        if (args.call_status) w.push(`call_status: {_eq: "${sanitize(args.call_status as string)}"}`)
        if (args.call_result) w.push(`call_result: {_eq: "${sanitize(args.call_result as string)}"}`)
        if (args.called_by) w.push(`called_by: {_eq: "${sanitize(args.called_by as string)}"}`)
        if (args.has_followup) w.push(`follow_up_date: {_is_null: false}`)
        if (args.created_after) w.push(`created_at: {_gte: "${sanitize(args.created_after as string)}"}`)
        const limit = Math.min(Number(args.limit) || 50, 200)
        const offset = Number(args.offset) || 0

        return hasura.query({
          query: `{
            calls(where: {${w.join(', ')}}, limit: ${limit}, offset: ${offset}, order_by: {created_at: desc}) {
              id lead_id call_status call_result call_notes call_duration
              follow_up_date follow_up_notes follow_up_call_time
              called_by assigned_member_id is_important tags created_at updated_at
              lead { id name phone email sell_status }
            }
            calls_aggregate(where: {${w.join(', ')}}) { aggregate { count } }
          }`,
        })
      },
    },

    // ── Create Call ──
    {
      name: 'crm_calls_create',
      description: 'Log a new call for a lead with outcome, notes, and optional follow-up.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Required' },
          lead_id: { type: 'string', description: 'Required' },
          called_by: { type: 'string' },
          call_status: { type: 'string', description: 'ANSWERED, NO_ANSWER, BUSY, WRONG_NUMBER, VOICEMAIL (required)' },
          call_result: { type: 'string' },
          call_notes: { type: 'string' },
          call_duration: { type: 'number' },
          follow_up_date: { type: 'string', description: 'YYYY-MM-DD' },
          follow_up_notes: { type: 'string' },
          follow_up_call_time: { type: 'string', description: 'HH:MM' },
          is_important: { type: 'boolean' },
          tags: { type: 'string', description: 'Comma-separated tags' },
        },
        required: ['product_id', 'lead_id', 'call_status'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: calls_insert_input!) {
            insert_calls_one(object: $input) {
              id lead_id call_status call_result call_notes follow_up_date created_at
            }
          }`,
          variables: { input: args },
        })
      },
    },

    // ── Update Call ──
    {
      name: 'crm_calls_update',
      description: 'Update an existing call record.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          call_id: { type: 'string', description: 'Call UUID (required)' },
          call_status: { type: 'string' }, call_result: { type: 'string' },
          call_notes: { type: 'string' }, call_duration: { type: 'number' },
          follow_up_date: { type: 'string' }, follow_up_notes: { type: 'string' },
          follow_up_call_time: { type: 'string' }, is_important: { type: 'boolean' },
        },
        required: ['call_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { call_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: calls_set_input!) {
            update_calls_by_pk(pk_columns: {id: "${sanitize(call_id as string)}"}, _set: $set) {
              id call_status call_result call_notes follow_up_date updated_at
            }
          }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Call ──
    {
      name: 'crm_calls_delete',
      description: 'Delete a call record.',
      inputSchema: {
        type: 'object' as const,
        properties: { call_id: { type: 'string', description: 'Call UUID (required)' } },
        required: ['call_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation { delete_calls_by_pk(id: "${sanitize(args.call_id as string)}") { id } }`,
        })
      },
    },

    // ── Call Stats ──
    {
      name: 'crm_calls_stats',
      description: 'Call statistics — total, answer rate, result distribution.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Required' },
          created_after: { type: 'string' }, created_before: { type: 'string' },
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
            total: calls_aggregate(where: {product_id: {_eq: "${pid}"}${dw}}) { aggregate { count } }
            answered: calls_aggregate(where: {product_id: {_eq: "${pid}"}, call_status: {_eq: "ANSWERED"}${dw}}) { aggregate { count } }
            no_answer: calls_aggregate(where: {product_id: {_eq: "${pid}"}, call_status: {_eq: "NO_ANSWER"}${dw}}) { aggregate { count } }
            busy: calls_aggregate(where: {product_id: {_eq: "${pid}"}, call_status: {_eq: "BUSY"}${dw}}) { aggregate { count } }
            success_result: calls_aggregate(where: {product_id: {_eq: "${pid}"}, call_result: {_eq: "SUCCESS"}${dw}}) { aggregate { count } }
            failed_result: calls_aggregate(where: {product_id: {_eq: "${pid}"}, call_result: {_eq: "FAILED"}${dw}}) { aggregate { count } }
            with_followup: calls_aggregate(where: {product_id: {_eq: "${pid}"}, follow_up_date: {_is_null: false}${dw}}) { aggregate { count } }
          }`,
        })
      },
    },

    // ── Call Templates ──
    {
      name: 'crm_call_templates_list',
      description: 'List call script templates.',
      inputSchema: {
        type: 'object' as const,
        properties: { product_id: { type: 'string', description: 'Required' } },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `{ call_templates(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}}, order_by: {created_at: desc}) { id name template_text is_active created_by created_at updated_at } }`,
        })
      },
    },

    // ── Create Call Template ──
    {
      name: 'crm_call_templates_create',
      description: 'Create a new call script template.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Required' },
          name: { type: 'string', description: 'Required' },
          template_text: { type: 'string', description: 'Required' },
          is_active: { type: 'boolean' },
          created_by: { type: 'string' },
        },
        required: ['product_id', 'name', 'template_text'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: call_templates_insert_input!) {
            insert_call_templates_one(object: $input) { id name is_active created_at }
          }`,
          variables: { input: args },
        })
      },
    },

    // ── Update Call Template ──
    {
      name: 'crm_call_templates_update',
      description: 'Update a call template.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          template_id: { type: 'string', description: 'Required' },
          name: { type: 'string' }, template_text: { type: 'string' }, is_active: { type: 'boolean' },
        },
        required: ['template_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { template_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: call_templates_set_input!) {
            update_call_templates_by_pk(pk_columns: {id: "${sanitize(template_id as string)}"}, _set: $set) { id name is_active updated_at }
          }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Call Template ──
    {
      name: 'crm_call_templates_delete',
      description: 'Delete a call template.',
      inputSchema: {
        type: 'object' as const,
        properties: { template_id: { type: 'string', description: 'Required' } },
        required: ['template_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation { delete_call_templates_by_pk(id: "${sanitize(args.template_id as string)}") { id } }`,
        })
      },
    },

    // ── Leads Needing Follow-up ──
    {
      name: 'crm_calls_needing_followup',
      description: 'Get leads/calls that have follow-up dates set — today, this week, or overdue.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Required' },
          period: { type: 'string', description: 'today, this_week, overdue (default: today)' },
          limit: { type: 'number' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const now = new Date()
        const today = now.toISOString().split('T')[0]
        const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
        const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

        let dateFilter: string
        switch (args.period) {
          case 'this_week':
            dateFilter = `follow_up_date: {_gte: "${today}", _lte: "${weekEnd}"}`
            break
          case 'overdue':
            dateFilter = `follow_up_date: {_lt: "${today}"}`
            break
          default: // today
            dateFilter = `follow_up_date: {_gte: "${today}", _lt: "${tomorrow}"}`
        }

        return hasura.query({
          query: `{
            calls(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}, ${dateFilter}, follow_up_date: {_is_null: false}}, order_by: {follow_up_date: asc}, limit: ${Math.min(Number(args.limit) || 50, 200)}) {
              id lead_id follow_up_date follow_up_notes follow_up_call_time call_status call_result called_by
              lead { id name phone email sell_status }
            }
          }`,
        })
      },
    },
  ]
}
