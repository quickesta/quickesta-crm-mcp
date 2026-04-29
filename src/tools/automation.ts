/**
 * Automation rules and webhook execution MCP tools.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'
import { sanitize } from '../utils.js'

export function createAutomationTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── List Rules ──
    { name: 'crm_automation_rules_list', description: 'List automation/webhook rules.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' },
        is_active: { type: 'boolean', description: 'Filter active/inactive' },
        trigger_type: { type: 'string', description: 'Filter by trigger type' },
      }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => {
        const w: string[] = [`product_id: {_eq: "${sanitize(args.product_id as string)}"}`]
        if (args.is_active !== undefined) w.push(`is_active: {_eq: ${args.is_active}}`)
        if (args.trigger_type) w.push(`trigger_type: {_eq: "${sanitize(args.trigger_type as string)}"}`)
        return hasura.query({
          query: `{ automation_rules(where: {${w.join(', ')}}, order_by: {created_at: desc}) { id name description trigger_type webhook_url is_active data_sources data_mappings conditions created_at updated_at } }`,
        })
      },
    },

    // ── Create Rule ──
    { name: 'crm_automation_rules_create', description: 'Create an automation rule.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, name: { type: 'string', description: 'Required' },
        trigger_type: { type: 'string', description: 'Required' }, webhook_url: { type: 'string', description: 'Required' },
        description: { type: 'string' }, is_active: { type: 'boolean' },
        data_sources: { type: 'object' }, data_mappings: { type: 'object' }, conditions: { type: 'object' },
        created_by: { type: 'string' },
      }, required: ['product_id', 'name', 'trigger_type', 'webhook_url'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: automation_rules_insert_input!) { insert_automation_rules_one(object: $input) { id name trigger_type is_active created_at } }`,
        variables: { input: args },
      }),
    },

    // ── Update Rule ──
    { name: 'crm_automation_rules_update', description: 'Update an automation rule.',
      inputSchema: { type: 'object' as const, properties: {
        rule_id: { type: 'string', description: 'Required' }, name: { type: 'string' }, description: { type: 'string' },
        trigger_type: { type: 'string' }, webhook_url: { type: 'string' }, is_active: { type: 'boolean' },
        data_sources: { type: 'object' }, data_mappings: { type: 'object' }, conditions: { type: 'object' },
      }, required: ['rule_id'] },
      handler: async (args: Record<string, unknown>) => {
        const { rule_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: automation_rules_set_input!) { update_automation_rules_by_pk(pk_columns: {id: "${sanitize(rule_id as string)}"}, _set: $set) { id name is_active updated_at } }`,
          variables: { set: updates },
        })
      },
    },

    // ── Toggle Rule ──
    { name: 'crm_automation_rules_toggle', description: 'Enable/disable an automation rule.',
      inputSchema: { type: 'object' as const, properties: {
        rule_id: { type: 'string', description: 'Required' }, is_active: { type: 'boolean', description: 'Required' },
      }, required: ['rule_id', 'is_active'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { update_automation_rules_by_pk(pk_columns: {id: "${sanitize(args.rule_id as string)}"}, _set: {is_active: ${args.is_active}}) { id name is_active } }`,
      }),
    },

    // ── Delete Rule ──
    { name: 'crm_automation_rules_delete', description: 'Delete an automation rule.',
      inputSchema: { type: 'object' as const, properties: { rule_id: { type: 'string', description: 'Required' } }, required: ['rule_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { delete_automation_rules_by_pk(id: "${sanitize(args.rule_id as string)}") { id } }`,
      }),
    },

    // ── Webhook Executions ──
    { name: 'crm_webhook_executions_list', description: 'List webhook execution logs for an automation rule.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' },
        automation_rule_id: { type: 'string', description: 'Filter by rule' },
        limit: { type: 'number' }, offset: { type: 'number' },
      }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => {
        const w: string[] = [`automation_rule: {product_id: {_eq: "${sanitize(args.product_id as string)}"}}`]
        if (args.automation_rule_id) w.push(`automation_rule_id: {_eq: "${sanitize(args.automation_rule_id as string)}"}`)
        return hasura.query({
          query: `{ webhook_executions(where: {${w.join(', ')}}, limit: ${Math.min(Number(args.limit) || 50, 200)}, offset: ${Number(args.offset) || 0}, order_by: {created_at: desc}) { id automation_rule_id webhook_url response_status success execution_time error_message created_at } }`,
        })
      },
    },
  ]
}
