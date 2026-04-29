/**
 * Call & call template tools — matches quickesta-crm-dashboard exactly.
 */
import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'

const CALL_FIELDS = `id lead_id product_id called_by assigned_member_id call_duration
  call_status call_result call_notes follow_up_date follow_up_notes
  follow_up_call_time is_important tags created_at updated_at`

const CALL_WITH_LEAD = `${CALL_FIELDS} lead { id name phone email sell_status source }`

const TEMPLATE_FIELDS = `id name template_text is_active created_by created_at updated_at`

export function createCallTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // GET_CALLS
    {
      name: 'crm_calls_list',
      description: 'Tüm arama kayıtları.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          limit: { type: 'number' }, offset: { type: 'number' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!) {
          calls(where: {product_id: {_eq: $product_id}}, order_by: {created_at: desc}) {
            ${CALL_WITH_LEAD}
          }
        }`,
        variables: { product_id: args.product_id },
      }),
    },

    // GET_CALLS_BY_LEAD
    {
      name: 'crm_calls_by_lead',
      description: 'Bir lead\'in arama geçmişi.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['lead_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($lead_id: uuid!, $product_id: uuid!) {
          calls(where: {lead_id: {_eq: $lead_id}, product_id: {_eq: $product_id}}, order_by: {created_at: desc}) {
            ${CALL_FIELDS}
          }
        }`,
        variables: { lead_id: args.lead_id, product_id: args.product_id },
      }),
    },

    // GET_CALL_BY_ID
    {
      name: 'crm_calls_get',
      description: 'Tek arama detayı.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          call_id: { type: 'string', description: 'Arama UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['call_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($id: uuid!, $product_id: uuid!) {
          calls(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}) { ${CALL_WITH_LEAD} }
        }`,
        variables: { id: args.call_id, product_id: args.product_id },
      }),
    },

    // GET_LEADS_NEEDING_FOLLOWUP
    {
      name: 'crm_calls_needing_followup',
      description: 'Takip gereken lead\'ler — bugün, bu hafta veya gecikmiş.',
      inputSchema: {
        type: 'object' as const,
        properties: { product_id: { type: 'string', description: 'Ürün ID (zorunlu)' } },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!) {
          leads_needing_followup(where: {product_id: {_eq: $product_id}}, order_by: {followup_date: asc}) {
            lead_id lead_name lead_phone lead_email followup_date sell_status
            total_calls last_call_date last_follow_up_date assigned_member_id
            follow_up_call_time last_call_status last_call_result
          }
        }`,
        variables: { product_id: args.product_id },
      }),
    },

    // CREATE_CALL
    {
      name: 'crm_calls_create',
      description: 'Yeni arama kaydı oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
          called_by: { type: 'string', description: 'Arayan üye UUID' },
          assigned_member_id: { type: 'string' },
          call_status: { type: 'string', description: 'ANSWERED, NO_ANSWER, BUSY, WRONG_NUMBER, VOICEMAIL (zorunlu)' },
          call_result: { type: 'string', description: 'NONE, SUCCESS, PARTIAL_SUCCESS, FAILED, RESCHEDULED' },
          call_notes: { type: 'string' },
          call_duration: { type: 'number', description: 'Saniye' },
          follow_up_date: { type: 'string', description: 'YYYY-MM-DD' },
          follow_up_notes: { type: 'string' },
          follow_up_call_time: { type: 'string', description: 'HH:MM:SS' },
          is_important: { type: 'boolean' },
          tags: { type: 'string', description: 'Etiketler (virgülle ayrılmış)' },
        },
        required: ['product_id', 'lead_id', 'call_status'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: calls_insert_input!) {
          insert_calls_one(object: $input) { ${CALL_FIELDS} }
        }`,
        variables: { input: args },
      }),
    },

    // UPDATE_CALL
    {
      name: 'crm_calls_update',
      description: 'Arama kaydı güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          call_id: { type: 'string', description: 'Arama UUID (zorunlu)' },
          call_status: { type: 'string' }, call_result: { type: 'string' },
          call_notes: { type: 'string' }, call_duration: { type: 'number' },
          follow_up_date: { type: 'string' }, follow_up_notes: { type: 'string' },
          follow_up_call_time: { type: 'string' }, is_important: { type: 'boolean' },
        },
        required: ['call_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { call_id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: calls_set_input!) {
            update_calls_by_pk(pk_columns: {id: $id}, _set: $input) { ${CALL_FIELDS} }
          }`,
          variables: { id: call_id, input },
        })
      },
    },

    // DELETE_CALL
    {
      name: 'crm_calls_delete',
      description: 'Arama kaydı sil.',
      inputSchema: {
        type: 'object' as const,
        properties: { call_id: { type: 'string', description: 'Arama UUID (zorunlu)' } },
        required: ['call_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($id: uuid!) { delete_calls_by_pk(id: $id) { id } }`,
        variables: { id: args.call_id },
      }),
    },

    // GET_CALL_TEMPLATES
    {
      name: 'crm_call_templates_list',
      description: 'Arama şablonları listesi.',
      inputSchema: {
        type: 'object' as const,
        properties: { product_id: { type: 'string', description: 'Ürün ID (zorunlu)' } },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!) {
          call_templates(where: {product_id: {_eq: $product_id}}, order_by: {created_at: desc}) { ${TEMPLATE_FIELDS} }
        }`,
        variables: { product_id: args.product_id },
      }),
    },

    // CREATE_CALL_TEMPLATE
    {
      name: 'crm_call_templates_create',
      description: 'Yeni arama şablonu oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          name: { type: 'string', description: 'Şablon adı (zorunlu)' },
          template_text: { type: 'string', description: 'Şablon metni (zorunlu)' },
          is_active: { type: 'boolean' }, created_by: { type: 'string' },
        },
        required: ['product_id', 'name', 'template_text'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: call_templates_insert_input!) {
          insert_call_templates_one(object: $input) { ${TEMPLATE_FIELDS} }
        }`,
        variables: { input: args },
      }),
    },

    // UPDATE_CALL_TEMPLATE
    {
      name: 'crm_call_templates_update',
      description: 'Arama şablonu güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          template_id: { type: 'string', description: 'Şablon UUID (zorunlu)' },
          name: { type: 'string' }, template_text: { type: 'string' }, is_active: { type: 'boolean' },
        },
        required: ['template_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { template_id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: call_templates_set_input!) {
            update_call_templates_by_pk(pk_columns: {id: $id}, _set: $input) { ${TEMPLATE_FIELDS} }
          }`,
          variables: { id: template_id, input },
        })
      },
    },

    // DELETE_CALL_TEMPLATE
    {
      name: 'crm_call_templates_delete',
      description: 'Arama şablonu sil.',
      inputSchema: {
        type: 'object' as const,
        properties: { template_id: { type: 'string', description: 'Şablon UUID (zorunlu)' } },
        required: ['template_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($id: uuid!) { delete_call_templates_by_pk(id: $id) { id } }`,
        variables: { id: args.template_id },
      }),
    },
  ]
}
