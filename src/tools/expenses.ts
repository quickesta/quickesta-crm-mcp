/**
 * Expenses and expense categories MCP tools.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'
import { sanitize } from '../utils.js'

export function createExpenseTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── List Expenses ──
    { name: 'crm_expenses_list', description: 'List expenses with category, approval status, and filters.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, category_id: { type: 'string' },
        status: { type: 'string', description: 'pending, approved, rejected' },
        expense_after: { type: 'string' }, expense_before: { type: 'string' },
        limit: { type: 'number' }, offset: { type: 'number' },
      }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => {
        const w: string[] = [`product_id: {_eq: "${sanitize(args.product_id as string)}"}`]
        if (args.category_id) w.push(`category_id: {_eq: "${sanitize(args.category_id as string)}"}`)
        if (args.status) w.push(`status: {_eq: "${sanitize(args.status as string)}"}`)
        if (args.expense_after) w.push(`expense_date: {_gte: "${sanitize(args.expense_after as string)}"}`)
        if (args.expense_before) w.push(`expense_date: {_lte: "${sanitize(args.expense_before as string)}"}`)
        const limit = Math.min(Number(args.limit) || 50, 200)
        return hasura.query({
          query: `{
            expenses(where: {${w.join(', ')}}, limit: ${limit}, offset: ${Number(args.offset) || 0}, order_by: {expense_date: desc}) {
              id title description amount expense_date payment_date payment_method invoice_number vendor_name vendor_contact receipt_url is_recurring recurring_period status approval_status approved_by approved_at rejection_reason tags created_by created_at
              expense_category { id name color }
            }
            expenses_aggregate(where: {${w.join(', ')}}) { aggregate { count sum { amount } } }
          }`,
        })
      },
    },

    // ── Create Expense ──
    { name: 'crm_expenses_create', description: 'Create an expense record.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, title: { type: 'string', description: 'Required' },
        amount: { type: 'number', description: 'Required' }, expense_date: { type: 'string', description: 'YYYY-MM-DD (required)' },
        category_id: { type: 'string' }, description: { type: 'string' }, payment_method: { type: 'string' },
        invoice_number: { type: 'string' }, vendor_name: { type: 'string' }, vendor_contact: { type: 'string' },
        is_recurring: { type: 'boolean' }, recurring_period: { type: 'string' }, created_by: { type: 'string' },
      }, required: ['product_id', 'title', 'amount', 'expense_date'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: expenses_insert_input!) { insert_expenses_one(object: $input) { id title amount expense_date status created_at } }`,
        variables: { input: args },
      }),
    },

    // ── Update Expense ──
    { name: 'crm_expenses_update', description: 'Update an expense.',
      inputSchema: { type: 'object' as const, properties: {
        expense_id: { type: 'string', description: 'Required' }, title: { type: 'string' }, amount: { type: 'number' },
        expense_date: { type: 'string' }, category_id: { type: 'string' }, description: { type: 'string' },
        payment_method: { type: 'string' }, vendor_name: { type: 'string' }, status: { type: 'string' },
      }, required: ['expense_id'] },
      handler: async (args: Record<string, unknown>) => {
        const { expense_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: expenses_set_input!) { update_expenses_by_pk(pk_columns: {id: "${sanitize(expense_id as string)}"}, _set: $set) { id title amount status updated_at } }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Expense ──
    { name: 'crm_expenses_delete', description: 'Delete an expense.',
      inputSchema: { type: 'object' as const, properties: { expense_id: { type: 'string', description: 'Required' } }, required: ['expense_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { delete_expenses_by_pk(id: "${sanitize(args.expense_id as string)}") { id } }`,
      }),
    },

    // ── Approve/Reject Expense ──
    { name: 'crm_expenses_approve', description: 'Approve an expense.',
      inputSchema: { type: 'object' as const, properties: { expense_id: { type: 'string', description: 'Required' }, approved_by: { type: 'string', description: 'Required' } }, required: ['expense_id', 'approved_by'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { update_expenses_by_pk(pk_columns: {id: "${sanitize(args.expense_id as string)}"}, _set: {approval_status: "approved", approved_by: "${sanitize(args.approved_by as string)}", approved_at: "now()"}) { id approval_status approved_by } }`,
      }),
    },

    { name: 'crm_expenses_reject', description: 'Reject an expense.',
      inputSchema: { type: 'object' as const, properties: { expense_id: { type: 'string', description: 'Required' }, rejection_reason: { type: 'string', description: 'Required' } }, required: ['expense_id', 'rejection_reason'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { update_expenses_by_pk(pk_columns: {id: "${sanitize(args.expense_id as string)}"}, _set: {approval_status: "rejected", rejection_reason: "${sanitize(args.rejection_reason as string)}"}) { id approval_status rejection_reason } }`,
      }),
    },

    // ── Expense Categories ──
    { name: 'crm_expense_categories_list', description: 'List expense categories.',
      inputSchema: { type: 'object' as const, properties: {} },
      handler: async () => hasura.query({
        query: `{ expense_categories(where: {is_active: {_eq: true}}, order_by: {name: asc}) { id name description color is_active created_at } }`,
      }),
    },

    { name: 'crm_expense_categories_create', description: 'Create an expense category.',
      inputSchema: { type: 'object' as const, properties: { name: { type: 'string', description: 'Required' }, description: { type: 'string' }, color: { type: 'string', description: 'Hex color' } }, required: ['name'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: expense_categories_insert_input!) { insert_expense_categories_one(object: $input) { id name color created_at } }`,
        variables: { input: args },
      }),
    },
  ]
}
