/**
 * Dynamic modules, fields, records, and extended field values MCP tools.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'
import { sanitize } from '../utils.js'

export function createModuleTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── List Modules ──
    { name: 'crm_modules_list', description: 'List custom modules with field definitions.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' } }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `{ modules(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}}) { id name display_name is_extended_module extends_table created_at module_fields(order_by: {field_order: asc}) { id field_name field_key field_type ui_type is_required enum_options default_value help_text color field_order min_value max_value min_length max_length } } }`,
      }),
    },

    // ── Create Module ──
    { name: 'crm_modules_create', description: 'Create a custom module (standalone or extending leads/payments).',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, name: { type: 'string', description: 'Required' },
        display_name: { type: 'string', description: 'Required' },
        is_extended_module: { type: 'boolean', description: 'True if extending leads/payments' },
        extends_table: { type: 'string', description: 'leads or payments (if extended)' },
      }, required: ['product_id', 'name', 'display_name'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: modules_insert_input!) { insert_modules_one(object: $input) { id name display_name is_extended_module extends_table created_at } }`,
        variables: { input: args },
      }),
    },

    // ── Update Module ──
    { name: 'crm_modules_update', description: 'Update a module.',
      inputSchema: { type: 'object' as const, properties: { module_id: { type: 'string', description: 'Required' }, name: { type: 'string' }, display_name: { type: 'string' } }, required: ['module_id'] },
      handler: async (args: Record<string, unknown>) => {
        const { module_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: modules_set_input!) { update_modules_by_pk(pk_columns: {id: "${sanitize(module_id as string)}"}, _set: $set) { id name display_name } }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Module (with dependencies) ──
    { name: 'crm_modules_delete', description: 'Delete a module and all its fields, records, and values.',
      inputSchema: { type: 'object' as const, properties: { module_id: { type: 'string', description: 'Required' } }, required: ['module_id'] },
      handler: async (args: Record<string, unknown>) => {
        const mid = sanitize(args.module_id as string)
        return hasura.query({
          query: `mutation {
            delete_module_field_values(where: {module_id: {_eq: "${mid}"}}) { affected_rows }
            delete_extended_field_values(where: {module_id: {_eq: "${mid}"}}) { affected_rows }
            delete_dynamic_module_records(where: {module_id: {_eq: "${mid}"}}) { affected_rows }
            delete_module_fields(where: {module_id: {_eq: "${mid}"}}) { affected_rows }
            delete_modules_by_pk(id: "${mid}") { id }
          }`,
        })
      },
    },

    // ── Create Module Field ──
    { name: 'crm_module_fields_create', description: 'Add a field to a module.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, module_id: { type: 'string', description: 'Required' },
        field_name: { type: 'string', description: 'Required' }, field_key: { type: 'string', description: 'Required' },
        field_type: { type: 'string', description: 'text, number, email, phone, date, datetime, boolean, enum, radio, textarea, url' },
        ui_type: { type: 'string', description: 'input, textarea, select, radio, checkbox, date_picker, etc.' },
        is_required: { type: 'boolean' }, enum_options: { type: 'array', items: { type: 'string' } },
        default_value: { type: 'string' }, help_text: { type: 'string' }, field_order: { type: 'number' },
      }, required: ['product_id', 'module_id', 'field_name', 'field_key', 'field_type', 'ui_type'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: module_fields_insert_input!) { insert_module_fields_one(object: $input) { id field_name field_key field_type ui_type field_order created_at } }`,
        variables: { input: args },
      }),
    },

    // ── Update Module Field ──
    { name: 'crm_module_fields_update', description: 'Update a module field.',
      inputSchema: { type: 'object' as const, properties: {
        field_id: { type: 'string', description: 'Required' }, field_name: { type: 'string' },
        field_type: { type: 'string' }, ui_type: { type: 'string' }, is_required: { type: 'boolean' },
        enum_options: { type: 'array', items: { type: 'string' } }, help_text: { type: 'string' }, field_order: { type: 'number' },
      }, required: ['field_id'] },
      handler: async (args: Record<string, unknown>) => {
        const { field_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: module_fields_set_input!) { update_module_fields_by_pk(pk_columns: {id: "${sanitize(field_id as string)}"}, _set: $set) { id field_name field_type field_order } }`,
          variables: { set: updates },
        })
      },
    },

    // ── Delete Module Field ──
    { name: 'crm_module_fields_delete', description: 'Delete a module field and its values.',
      inputSchema: { type: 'object' as const, properties: { field_id: { type: 'string', description: 'Required' } }, required: ['field_id'] },
      handler: async (args: Record<string, unknown>) => {
        const fid = sanitize(args.field_id as string)
        return hasura.query({
          query: `mutation {
            delete_module_field_values(where: {field_id: {_eq: "${fid}"}}) { affected_rows }
            delete_extended_field_values(where: {field_id: {_eq: "${fid}"}}) { affected_rows }
            delete_module_fields_by_pk(id: "${fid}") { id }
          }`,
        })
      },
    },

    // ── List Module Records ──
    { name: 'crm_module_records_list', description: 'List records for a standalone module with their field values.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, module_id: { type: 'string', description: 'Required' },
        limit: { type: 'number' }, offset: { type: 'number' },
      }, required: ['product_id', 'module_id'] },
      handler: async (args: Record<string, unknown>) => {
        const limit = Math.min(Number(args.limit) || 50, 200)
        return hasura.query({
          query: `{
            dynamic_module_records(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}, module_id: {_eq: "${sanitize(args.module_id as string)}"}}, limit: ${limit}, offset: ${Number(args.offset) || 0}, order_by: {created_at: desc}) {
              id module_id created_at
              module_field_values { id field_id value module_field { field_name field_key field_type } }
            }
            dynamic_module_records_aggregate(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}, module_id: {_eq: "${sanitize(args.module_id as string)}"}}) { aggregate { count } }
          }`,
        })
      },
    },

    // ── Create Module Record ──
    { name: 'crm_module_records_create', description: 'Create a record in a standalone module with field values.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, module_id: { type: 'string', description: 'Required' },
        field_values: { type: 'array', description: 'Array of {field_id, value}', items: { type: 'object' } },
      }, required: ['product_id', 'module_id'] },
      handler: async (args: Record<string, unknown>) => {
        const record = await hasura.query<{ insert_dynamic_module_records_one: { id: string } }>({
          query: `mutation($input: dynamic_module_records_insert_input!) { insert_dynamic_module_records_one(object: $input) { id } }`,
          variables: { input: { product_id: args.product_id, module_id: args.module_id } },
        })
        const recordId = record.insert_dynamic_module_records_one.id
        if (Array.isArray(args.field_values) && args.field_values.length > 0) {
          const values = (args.field_values as Array<{ field_id: string; value: string }>).map((fv) => ({
            product_id: args.product_id, module_id: args.module_id, record_id: recordId, field_id: fv.field_id, value: fv.value,
          }))
          await hasura.query({
            query: `mutation($values: [module_field_values_insert_input!]!) { insert_module_field_values(objects: $values) { affected_rows } }`,
            variables: { values },
          })
        }
        return { id: recordId, module_id: args.module_id }
      },
    },

    // ── Delete Module Record ──
    { name: 'crm_module_records_delete', description: 'Delete a module record and its field values.',
      inputSchema: { type: 'object' as const, properties: { record_id: { type: 'string', description: 'Required' } }, required: ['record_id'] },
      handler: async (args: Record<string, unknown>) => {
        const rid = sanitize(args.record_id as string)
        return hasura.query({
          query: `mutation {
            delete_module_field_values(where: {record_id: {_eq: "${rid}"}}) { affected_rows }
            delete_dynamic_module_records_by_pk(id: "${rid}") { id }
          }`,
        })
      },
    },
  ]
}
