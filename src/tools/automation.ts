/**
 * Otomasyon kuralları ve webhook çalıştırma MCP araçları.
 * Tüm sorgular $variable sözdizimi kullanır — string interpolasyon yok.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'

const RULE_FIELDS = `id product_id name description trigger_type webhook_url is_active
  data_sources data_mappings conditions created_by created_at updated_at`

const EXECUTION_FIELDS = `id automation_rule_id webhook_url request_payload response_payload
  response_status success execution_time error_message created_at`

export function createAutomationTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── GET_AUTOMATION_RULES ──
    {
      name: 'crm_automation_rules_list',
      description: 'Ürüne ait tüm otomasyon kurallarını listeler — veri kaynakları, eşlemeler, koşullar dahil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!) {
            automation_rules(where: {product_id: {_eq: $product_id}}, order_by: {created_at: desc}) {
              ${RULE_FIELDS}
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── GET_AUTOMATION_RULE_BY_ID ──
    {
      name: 'crm_automation_rules_get',
      description: 'Tek bir otomasyon kuralının detayını getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kural UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($id: uuid!, $product_id: uuid!) {
            automation_rules(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}) {
              ${RULE_FIELDS}
            }
          }`,
          variables: { id: args.id, product_id: args.product_id },
        })
      },
    },

    // ── GET_ACTIVE_AUTOMATION_RULES ──
    {
      name: 'crm_automation_rules_active',
      description: 'Yalnızca aktif otomasyon kurallarını listeler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!) {
            automation_rules(
              where: {product_id: {_eq: $product_id}, is_active: {_eq: true}}
              order_by: {created_at: desc}
            ) {
              ${RULE_FIELDS}
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── GET_AUTOMATION_RULES_BY_TRIGGER ──
    {
      name: 'crm_automation_rules_by_trigger',
      description: 'Belirli bir tetikleyici tipine göre otomasyon kurallarını filtreler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          trigger_type: { type: 'string', description: 'Tetikleyici tipi (zorunlu)' },
        },
        required: ['product_id', 'trigger_type'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!, $trigger_type: String!) {
            automation_rules(
              where: {product_id: {_eq: $product_id}, trigger_type: {_eq: $trigger_type}}
              order_by: {created_at: desc}
            ) {
              ${RULE_FIELDS}
            }
          }`,
          variables: { product_id: args.product_id, trigger_type: args.trigger_type },
        })
      },
    },

    // ── GET_WEBHOOK_EXECUTIONS ──
    {
      name: 'crm_webhook_executions_list',
      description: 'Webhook çalıştırma loglarını listeler — kural bazlı filtreleme destekli.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          automation_rule_id: { type: 'string', description: 'Kural UUID ile filtrele' },
          limit: { type: 'number', description: 'Maks sonuç (varsayılan: 50)' },
          offset: { type: 'number', description: 'Sayfalama offset' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const where: Record<string, unknown> = {
          automation_rule: { product_id: { _eq: args.product_id } },
        }
        if (args.automation_rule_id) {
          where.automation_rule_id = { _eq: args.automation_rule_id }
        }
        return hasura.query({
          query: `query($where: webhook_executions_bool_exp!, $limit: Int, $offset: Int) {
            webhook_executions(
              where: $where
              order_by: {created_at: desc}
              limit: $limit
              offset: $offset
            ) {
              ${EXECUTION_FIELDS}
            }
            webhook_executions_aggregate(where: $where) {
              aggregate { count }
            }
          }`,
          variables: {
            where,
            limit: Math.min(Number(args.limit) || 50, 200),
            offset: Number(args.offset) || 0,
          },
        })
      },
    },

    // ── GET_WEBHOOK_EXECUTION_BY_ID ──
    {
      name: 'crm_webhook_executions_get',
      description: 'Tek bir webhook çalıştırma kaydının detayını getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Çalıştırma UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($id: uuid!, $product_id: uuid!) {
            webhook_executions(
              where: {id: {_eq: $id}, automation_rule: {product_id: {_eq: $product_id}}}
            ) {
              ${EXECUTION_FIELDS}
              automation_rule { id name trigger_type }
            }
          }`,
          variables: { id: args.id, product_id: args.product_id },
        })
      },
    },

    // ── CREATE_AUTOMATION_RULE ──
    {
      name: 'crm_automation_rules_create',
      description: 'Yeni otomasyon kuralı oluşturur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          name: { type: 'string', description: 'Kural adı (zorunlu)' },
          trigger_type: { type: 'string', description: 'Tetikleyici tipi (zorunlu)' },
          webhook_url: { type: 'string', description: 'Webhook URL (zorunlu)' },
          description: { type: 'string', description: 'Açıklama' },
          is_active: { type: 'boolean', description: 'Aktif mi (varsayılan: true)' },
          data_sources: { type: 'object', description: 'Veri kaynakları (JSONB)' },
          data_mappings: { type: 'object', description: 'Veri eşlemeleri (JSONB)' },
          conditions: { type: 'object', description: 'Koşullar (JSONB)' },
          created_by: { type: 'string', description: 'Oluşturan kullanıcı' },
        },
        required: ['product_id', 'name', 'trigger_type', 'webhook_url'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: automation_rules_insert_input!) {
            insert_automation_rules_one(object: $input) {
              ${RULE_FIELDS}
            }
          }`,
          variables: { input: args },
        })
      },
    },

    // ── UPDATE_AUTOMATION_RULE ──
    {
      name: 'crm_automation_rules_update',
      description: 'Otomasyon kuralını günceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kural UUID (zorunlu)' },
          name: { type: 'string', description: 'Kural adı' },
          description: { type: 'string', description: 'Açıklama' },
          trigger_type: { type: 'string', description: 'Tetikleyici tipi' },
          webhook_url: { type: 'string', description: 'Webhook URL' },
          is_active: { type: 'boolean', description: 'Aktif mi' },
          data_sources: { type: 'object', description: 'Veri kaynakları (JSONB)' },
          data_mappings: { type: 'object', description: 'Veri eşlemeleri (JSONB)' },
          conditions: { type: 'object', description: 'Koşullar (JSONB)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: automation_rules_set_input!) {
            update_automation_rules_by_pk(pk_columns: {id: $id}, _set: $input) {
              ${RULE_FIELDS}
            }
          }`,
          variables: { id, input },
        })
      },
    },

    // ── DELETE_AUTOMATION_RULE ──
    {
      name: 'crm_automation_rules_delete',
      description: 'Otomasyon kuralını siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kural UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_automation_rules_by_pk(id: $id) { id name }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── TOGGLE_AUTOMATION_RULE ──
    {
      name: 'crm_automation_rules_toggle',
      description: 'Otomasyon kuralını aktif/pasif yapar.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kural UUID (zorunlu)' },
          is_active: { type: 'boolean', description: 'Aktif mi (zorunlu)' },
        },
        required: ['id', 'is_active'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $is_active: Boolean!) {
            update_automation_rules_by_pk(pk_columns: {id: $id}, _set: {is_active: $is_active}) {
              id name is_active updated_at
            }
          }`,
          variables: { id: args.id, is_active: args.is_active },
        })
      },
    },

    // ── CREATE_WEBHOOK_EXECUTION ──
    {
      name: 'crm_webhook_executions_create',
      description: 'Yeni webhook çalıştırma kaydı oluşturur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          automation_rule_id: { type: 'string', description: 'Kural UUID (zorunlu)' },
          webhook_url: { type: 'string', description: 'Webhook URL (zorunlu)' },
          request_payload: { type: 'object', description: 'Gönderilen veri' },
          response_payload: { type: 'object', description: 'Alınan yanıt' },
          response_status: { type: 'number', description: 'HTTP durum kodu' },
          success: { type: 'boolean', description: 'Başarılı mı' },
          execution_time: { type: 'number', description: 'Çalışma süresi (ms)' },
          error_message: { type: 'string', description: 'Hata mesajı' },
        },
        required: ['automation_rule_id', 'webhook_url'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: webhook_executions_insert_input!) {
            insert_webhook_executions_one(object: $input) {
              ${EXECUTION_FIELDS}
            }
          }`,
          variables: { input: args },
        })
      },
    },

    // ── BULK_UPDATE_AUTOMATION_RULES ──
    {
      name: 'crm_automation_rules_bulk_update',
      description: 'Birden fazla otomasyon kuralını toplu günceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'Kural UUID listesi (zorunlu)' },
          is_active: { type: 'boolean', description: 'Aktif durumu' },
          name: { type: 'string' },
          description: { type: 'string' },
          trigger_type: { type: 'string' },
          webhook_url: { type: 'string' },
          data_sources: { type: 'object' },
          data_mappings: { type: 'object' },
          conditions: { type: 'object' },
        },
        required: ['ids'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { ids, ...input } = args
        return hasura.query({
          query: `mutation($ids: [uuid!]!, $input: automation_rules_set_input!) {
            update_automation_rules(where: {id: {_in: $ids}}, _set: $input) {
              affected_rows
              returning { id name is_active updated_at }
            }
          }`,
          variables: { ids, input },
        })
      },
    },

    // ── BULK_DELETE_AUTOMATION_RULES ──
    {
      name: 'crm_automation_rules_bulk_delete',
      description: 'Birden fazla otomasyon kuralını toplu siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'Kural UUID listesi (zorunlu)' },
        },
        required: ['ids'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($ids: [uuid!]!) {
            delete_automation_rules(where: {id: {_in: $ids}}) {
              affected_rows
            }
          }`,
          variables: { ids: args.ids },
        })
      },
    },
  ]
}
