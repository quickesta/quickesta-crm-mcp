/**
 * Members, roles, affiliates, commissions MCP tools.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'
import { sanitize } from '../utils.js'

export function createMemberTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── List Members with Roles ──
    { name: 'crm_members_list', description: 'List team members with their roles.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' } }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `{ members(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}}) { id email name color created_at member_roles { role { id name description } } } }`,
      }),
    },

    // ── Create Member ──
    { name: 'crm_members_create', description: 'Add a team member.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, id: { type: 'string', description: 'User UUID (required)' },
        email: { type: 'string', description: 'Required' }, name: { type: 'string' }, color: { type: 'string' },
      }, required: ['product_id', 'id', 'email'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: members_insert_input!) { insert_members_one(object: $input) { id email name created_at } }`,
        variables: { input: args },
      }),
    },

    // ── Update Member ──
    { name: 'crm_members_update', description: 'Update a member.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, member_id: { type: 'string', description: 'Required' },
        name: { type: 'string' }, color: { type: 'string' },
      }, required: ['product_id', 'member_id'] },
      handler: async (args: Record<string, unknown>) => {
        const { product_id, member_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: members_set_input!) { update_members_by_pk(pk_columns: {product_id: "${sanitize(product_id as string)}", id: "${sanitize(member_id as string)}"}, _set: $set) { id name color } }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Member ──
    { name: 'crm_members_delete', description: 'Remove a team member.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' }, member_id: { type: 'string', description: 'Required' } }, required: ['product_id', 'member_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { delete_members(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}, id: {_eq: "${sanitize(args.member_id as string)}"}}) { affected_rows } }`,
      }),
    },

    // ── List Roles ──
    { name: 'crm_roles_list', description: 'List roles with permissions.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' } }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `{ roles(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}}) { id name description created_at role_module_permissions { module_id can_read can_write can_update can_delete } } }`,
      }),
    },

    // ── Create Role ──
    { name: 'crm_roles_create', description: 'Create a new role.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' }, name: { type: 'string', description: 'Required' }, description: { type: 'string' } }, required: ['product_id', 'name'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: roles_insert_input!) { insert_roles_one(object: $input) { id name description created_at } }`,
        variables: { input: args },
      }),
    },

    // ── Assign Role to Member ──
    { name: 'crm_roles_assign', description: 'Assign a role to a member.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' }, member_id: { type: 'string', description: 'Required' }, role_id: { type: 'string', description: 'Required' } }, required: ['product_id', 'member_id', 'role_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: member_roles_insert_input!) { insert_member_roles_one(object: $input) { id member_id role_id } }`,
        variables: { input: args },
      }),
    },

    // ── Remove Role from Member ──
    { name: 'crm_roles_remove', description: 'Remove a role from a member.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' }, member_id: { type: 'string', description: 'Required' }, role_id: { type: 'string', description: 'Required' } }, required: ['product_id', 'member_id', 'role_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { delete_member_roles(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}, member_id: {_eq: "${sanitize(args.member_id as string)}"}, role_id: {_eq: "${sanitize(args.role_id as string)}"}}) { affected_rows } }`,
      }),
    },

    // ── Set Role Permission ──
    { name: 'crm_roles_set_permission', description: 'Set module permissions for a role.',
      inputSchema: { type: 'object' as const, properties: {
        role_id: { type: 'string', description: 'Required' }, module_id: { type: 'string', description: 'Required' },
        can_read: { type: 'boolean' }, can_write: { type: 'boolean' }, can_update: { type: 'boolean' }, can_delete: { type: 'boolean' },
      }, required: ['role_id', 'module_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: role_module_permissions_insert_input!) { insert_role_module_permissions_one(object: $input, on_conflict: {constraint: role_module_permissions_role_id_module_id_key, update_columns: [can_read, can_write, can_update, can_delete]}) { id role_id module_id can_read can_write can_update can_delete } }`,
        variables: { input: args },
      }),
    },

    // ── List Affiliates ──
    { name: 'crm_affiliates_list', description: 'List affiliate partners with commission stats.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' }, status: { type: 'string', description: 'ACTIVE or INACTIVE' } }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => {
        const w: string[] = [`product_id: {_eq: "${sanitize(args.product_id as string)}"}`]
        if (args.status) w.push(`status: {_eq: "${sanitize(args.status as string)}"}`)
        return hasura.query({
          query: `{ affiliates(where: {${w.join(', ')}}) { id name email phone commission_rate status notes report_token created_at affiliate_commissions_aggregate { aggregate { count sum { commission_amount } } } } }`,
        })
      },
    },

    // ── Create Affiliate ──
    { name: 'crm_affiliates_create', description: 'Create an affiliate partner.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, name: { type: 'string', description: 'Required' },
        email: { type: 'string' }, phone: { type: 'string' }, commission_rate: { type: 'number', description: 'Default: 10' },
        status: { type: 'string', description: 'Default: ACTIVE' }, notes: { type: 'string' },
      }, required: ['product_id', 'name'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: affiliates_insert_input!) { insert_affiliates_one(object: $input) { id name email commission_rate status created_at } }`,
        variables: { input: args },
      }),
    },

    // ── Update Affiliate ──
    { name: 'crm_affiliates_update', description: 'Update an affiliate.',
      inputSchema: { type: 'object' as const, properties: { affiliate_id: { type: 'string', description: 'Required' }, name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, commission_rate: { type: 'number' }, status: { type: 'string' }, notes: { type: 'string' } }, required: ['affiliate_id'] },
      handler: async (args: Record<string, unknown>) => {
        const { affiliate_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: affiliates_set_input!) { update_affiliates_by_pk(pk_columns: {id: "${sanitize(affiliate_id as string)}"}, _set: $set) { id name status commission_rate } }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Affiliate ──
    { name: 'crm_affiliates_delete', description: 'Delete an affiliate.',
      inputSchema: { type: 'object' as const, properties: { affiliate_id: { type: 'string', description: 'Required' } }, required: ['affiliate_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { delete_affiliates_by_pk(id: "${sanitize(args.affiliate_id as string)}") { id } }`,
      }),
    },

    // ── Create Commission ──
    { name: 'crm_commissions_create', description: 'Create an affiliate commission record.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, affiliate_id: { type: 'string', description: 'Required' },
        commission_amount: { type: 'number', description: 'Required' }, commission_rate: { type: 'number' },
        lead_id: { type: 'string' }, payment_id: { type: 'string' }, status: { type: 'string', description: 'PENDING, PARTIAL, COMPLETED, PAID, CANCELLED' }, notes: { type: 'string' },
      }, required: ['product_id', 'affiliate_id', 'commission_amount'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: affiliate_commissions_insert_input!) { insert_affiliate_commissions_one(object: $input) { id affiliate_id commission_amount status created_at } }`,
        variables: { input: args },
      }),
    },

    // ── Update Commission ──
    { name: 'crm_commissions_update', description: 'Update a commission record.',
      inputSchema: { type: 'object' as const, properties: { commission_id: { type: 'string', description: 'Required' }, status: { type: 'string' }, commission_amount: { type: 'number' }, notes: { type: 'string' }, payment_date: { type: 'string' } }, required: ['commission_id'] },
      handler: async (args: Record<string, unknown>) => {
        const { commission_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: affiliate_commissions_set_input!) { update_affiliate_commissions_by_pk(pk_columns: {id: "${sanitize(commission_id as string)}"}, _set: $set) { id status commission_amount updated_at } }`,
          variables: { set: updates },
        })
      },
    },
  ]
}
