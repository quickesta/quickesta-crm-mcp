/**
 * Payment, payment detail, and discount MCP tools.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'
import { sanitize } from '../utils.js'

export function createPaymentTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── List Payments ──
    {
      name: 'crm_payments_list',
      description: 'List payments with installments and discounts.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Required' },
          lead_id: { type: 'string' },
          created_after: { type: 'string' }, created_before: { type: 'string' },
          limit: { type: 'number' }, offset: { type: 'number' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const w: string[] = [`product_id: {_eq: "${sanitize(args.product_id as string)}"}`]
        if (args.lead_id) w.push(`lead_id: {_eq: "${sanitize(args.lead_id as string)}"}`)
        if (args.created_after) w.push(`created_at: {_gte: "${sanitize(args.created_after as string)}"}`)
        if (args.created_before) w.push(`created_at: {_lte: "${sanitize(args.created_before as string)}"}`)
        const limit = Math.min(Number(args.limit) || 50, 200)
        const offset = Number(args.offset) || 0

        return hasura.query({
          query: `{
            payments(where: {${w.join(', ')}}, limit: ${limit}, offset: ${offset}, order_by: {created_at: desc}) {
              id lead_id name description phone email total_amount note affiliate_id created_at updated_at
              payment_details(order_by: {due_date: asc}) { id due_date amount paid_amount status payment_type payment_date note created_at }
              payment_discounts { id discount_type discount_value discount_reason applied_by_member_id created_at }
              extended_field_values { id field_id module_id value }
            }
            payments_aggregate(where: {${w.join(', ')}}) { aggregate { count } }
          }`,
        })
      },
    },

    // ── Get Payment ──
    {
      name: 'crm_payments_get',
      description: 'Get single payment with all details.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          payment_id: { type: 'string', description: 'Required' },
          product_id: { type: 'string', description: 'Required' },
        },
        required: ['payment_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `{
            payments(where: {id: {_eq: "${sanitize(args.payment_id as string)}"}, product_id: {_eq: "${sanitize(args.product_id as string)}"}}) {
              id lead_id name description phone email total_amount note affiliate_id created_at updated_at
              payment_details(order_by: {due_date: asc}) { id due_date amount paid_amount status payment_type payment_date note }
              payment_discounts { id discount_type discount_value discount_reason applied_by_member_id }
              extended_field_values { id field_id module_id value }
              lead { id name phone email sell_status }
            }
          }`,
        })
      },
    },

    // ── Create Payment ──
    {
      name: 'crm_payments_create',
      description: 'Create a payment record.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Required' },
          name: { type: 'string', description: 'Required' },
          total_amount: { type: 'number', description: 'Required' },
          lead_id: { type: 'string' }, description: { type: 'string' },
          phone: { type: 'string' }, email: { type: 'string' },
          note: { type: 'string' }, affiliate_id: { type: 'string' },
        },
        required: ['product_id', 'name', 'total_amount'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: payments_insert_input!) { insert_payments_one(object: $input) { id name total_amount lead_id created_at } }`,
          variables: { input: args },
        })
      },
    },

    // ── Update Payment ──
    {
      name: 'crm_payments_update',
      description: 'Update a payment record.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          payment_id: { type: 'string', description: 'Required' },
          name: { type: 'string' }, description: { type: 'string' },
          total_amount: { type: 'number' }, note: { type: 'string' },
          phone: { type: 'string' }, email: { type: 'string' },
        },
        required: ['payment_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { payment_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: payments_set_input!) { update_payments_by_pk(pk_columns: {id: "${sanitize(payment_id as string)}"}, _set: $set) { id name total_amount updated_at } }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Payment ──
    {
      name: 'crm_payments_delete',
      description: 'Delete a payment record.',
      inputSchema: {
        type: 'object' as const,
        properties: { payment_id: { type: 'string', description: 'Required' } },
        required: ['payment_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation { delete_payments_by_pk(id: "${sanitize(args.payment_id as string)}") { id } }`,
        })
      },
    },

    // ── Payment Stats ──
    {
      name: 'crm_payments_stats',
      description: 'Payment statistics — revenue, outstanding, paid, overdue.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Required' },
          created_after: { type: 'string' }, created_before: { type: 'string' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const pid = sanitize(args.product_id as string)
        return hasura.query({
          query: `{
            total: payments_aggregate(where: {product_id: {_eq: "${pid}"}}) { aggregate { count sum { total_amount } } }
            paid: payment_details_aggregate(where: {payment: {product_id: {_eq: "${pid}"}}, status: {_eq: "PAID"}}) { aggregate { count sum { paid_amount } } }
            pending: payment_details_aggregate(where: {payment: {product_id: {_eq: "${pid}"}}, status: {_eq: "PENDING"}}) { aggregate { count sum { amount } } }
            overdue: payment_details_aggregate(where: {payment: {product_id: {_eq: "${pid}"}}, status: {_eq: "OVERDUE"}}) { aggregate { count sum { amount } } }
          }`,
        })
      },
    },

    // ── Create Payment Detail (Installment) ──
    {
      name: 'crm_payment_details_create',
      description: 'Add a payment installment/detail to a payment.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          payment_id: { type: 'string', description: 'Required' },
          due_date: { type: 'string', description: 'YYYY-MM-DD (required)' },
          amount: { type: 'number', description: 'Required' },
          paid_amount: { type: 'number', description: 'Default: 0' },
          status: { type: 'string', description: 'DRAFT, PENDING, PAID, OVERDUE, CANCELLED, WAITING_NEWS' },
          payment_type: { type: 'string', description: 'CASH, TRANSFER, CREDIT_CARD, CHECK, OTHER' },
          payment_date: { type: 'string' }, note: { type: 'string' },
        },
        required: ['payment_id', 'due_date', 'amount'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: payment_details_insert_input!) { insert_payment_details_one(object: $input) { id payment_id due_date amount status created_at } }`,
          variables: { input: args },
        })
      },
    },

    // ── Update Payment Detail ──
    {
      name: 'crm_payment_details_update',
      description: 'Update a payment installment (mark as paid, change date, etc).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          detail_id: { type: 'string', description: 'Required' },
          due_date: { type: 'string' }, amount: { type: 'number' },
          paid_amount: { type: 'number' }, status: { type: 'string' },
          payment_type: { type: 'string' }, payment_date: { type: 'string' }, note: { type: 'string' },
        },
        required: ['detail_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { detail_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: payment_details_set_input!) { update_payment_details_by_pk(pk_columns: {id: "${sanitize(detail_id as string)}"}, _set: $set) { id status paid_amount payment_date updated_at } }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Payment Detail ──
    {
      name: 'crm_payment_details_delete',
      description: 'Delete a payment installment.',
      inputSchema: {
        type: 'object' as const,
        properties: { detail_id: { type: 'string', description: 'Required' } },
        required: ['detail_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation { delete_payment_details_by_pk(id: "${sanitize(args.detail_id as string)}") { id } }`,
        })
      },
    },

    // ── Create Payment Discount ──
    {
      name: 'crm_payment_discounts_create',
      description: 'Add a discount to a payment.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          payment_id: { type: 'string', description: 'Required' },
          discount_type: { type: 'string', description: 'PERCENTAGE or FIXED (required)' },
          discount_value: { type: 'number', description: 'Required' },
          discount_reason: { type: 'string' },
          applied_by_member_id: { type: 'string' },
        },
        required: ['payment_id', 'discount_type', 'discount_value'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: payment_discounts_insert_input!) { insert_payment_discounts_one(object: $input) { id discount_type discount_value discount_reason created_at } }`,
          variables: { input: args },
        })
      },
    },

    // ── Update Payment Discount ──
    {
      name: 'crm_payment_discounts_update',
      description: 'Update a payment discount.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          discount_id: { type: 'string', description: 'Required' },
          discount_type: { type: 'string' }, discount_value: { type: 'number' },
          discount_reason: { type: 'string' },
        },
        required: ['discount_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { discount_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: payment_discounts_set_input!) { update_payment_discounts_by_pk(pk_columns: {id: "${sanitize(discount_id as string)}"}, _set: $set) { id discount_type discount_value updated_at } }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Payment Discount ──
    {
      name: 'crm_payment_discounts_delete',
      description: 'Remove a payment discount.',
      inputSchema: {
        type: 'object' as const,
        properties: { discount_id: { type: 'string', description: 'Required' } },
        required: ['discount_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation { delete_payment_discounts_by_pk(id: "${sanitize(args.discount_id as string)}") { id } }`,
        })
      },
    },
  ]
}
