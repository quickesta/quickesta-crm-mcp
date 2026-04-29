/**
 * Lead tools — exactly matches quickesta-crm-dashboard GraphQL operations.
 */
import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'

const LEAD_FIELDS = `id product_id name phone country_code email source lead_message
  assigned_member_id assigned_note sell_status rejection_reason
  affiliate_id trial_duration trial_start_date is_deleted created_at`

const LEAD_WITH_CALLS = `${LEAD_FIELDS} calls(limit: 1, order_by: {created_at: desc}) { created_at }`

const LEAD_DETAIL_FIELDS = `${LEAD_FIELDS}
  calls(order_by: {created_at: desc}) {
    id lead_id product_id called_by assigned_member_id call_duration
    call_status call_result call_notes follow_up_date follow_up_notes
    follow_up_call_time is_important tags created_at updated_at
  }
  payments(order_by: {created_at: desc}) {
    id product_id lead_id name description phone country_code email
    total_amount note created_at updated_at affiliate_id
    payment_details(order_by: {due_date: asc}) {
      id payment_id due_date amount paid_amount status payment_date note payment_type created_at updated_at
    }
    payment_discounts {
      id payment_id discount_type discount_value discount_reason applied_by_member_id created_at updated_at
    }
  }
  extended_field_values {
    id record_id record_type module_id field_id value created_at
    module_field { id field_name field_key field_type ui_type is_required enum_options default_value help_text color field_order }
  }`

export function createLeadTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // GET_LEADS
    {
      name: 'crm_leads_list',
      description: 'Lead listesi — filtre, sayfalama, sıralama destekli.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          include_deleted: { type: 'boolean', description: 'Silinmişleri dahil et (varsayılan: false)' },
          limit: { type: 'number', description: 'Maks sonuç (varsayılan: 100)' },
          offset: { type: 'number', description: 'Sayfalama offset' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!, $include_deleted: Boolean = false, $limit: Int, $offset: Int) {
            leads(
              where: {product_id: {_eq: $product_id}, _or: [{is_deleted: {_eq: false}}, {is_deleted: {_eq: $include_deleted}}]}
              order_by: {created_at: desc}
              limit: $limit
              offset: $offset
            ) { ${LEAD_WITH_CALLS} }
            leads_aggregate(where: {product_id: {_eq: $product_id}, _or: [{is_deleted: {_eq: false}}, {is_deleted: {_eq: $include_deleted}}]}) {
              aggregate { count }
            }
          }`,
          variables: {
            product_id: args.product_id,
            include_deleted: args.include_deleted ?? false,
            limit: Math.min(Number(args.limit) || 100, 500),
            offset: Number(args.offset) || 0,
          },
        })
      },
    },

    // GET_LEAD_BY_ID
    {
      name: 'crm_leads_get',
      description: 'Tek lead detayı — aramalar, ödemeler, özel alanlar dahil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
        },
        required: ['product_id', 'lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($id: uuid!, $product_id: uuid!) {
            leads(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}) {
              ${LEAD_DETAIL_FIELDS}
            }
          }`,
          variables: { id: args.lead_id, product_id: args.product_id },
        })
      },
    },

    // GET_LEADS_BY_IDS
    {
      name: 'crm_leads_get_by_ids',
      description: 'Birden fazla lead getir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          lead_ids: { type: 'array', items: { type: 'string' }, description: 'Lead UUID listesi (zorunlu)' },
        },
        required: ['product_id', 'lead_ids'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!, $lead_ids: [uuid!]!) {
            leads(where: {product_id: {_eq: $product_id}, id: {_in: $lead_ids}}) {
              ${LEAD_FIELDS}
            }
          }`,
          variables: { product_id: args.product_id, lead_ids: args.lead_ids },
        })
      },
    },

    // GET_LEADS_WITHOUT_CALLS
    {
      name: 'crm_leads_without_calls',
      description: 'Hiç aranmamış lead listesi.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          include_deleted: { type: 'boolean' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!, $include_deleted: Boolean = false) {
            leads(
              where: {product_id: {_eq: $product_id}, _not: {calls: {}}, _or: [{is_deleted: {_eq: false}}, {is_deleted: {_eq: $include_deleted}}]}
              order_by: {created_at: desc}
            ) { ${LEAD_FIELDS} }
          }`,
          variables: { product_id: args.product_id, include_deleted: args.include_deleted ?? false },
        })
      },
    },

    // CHECK_EXISTING_LEAD
    {
      name: 'crm_leads_check_duplicate',
      description: 'Telefon veya email ile mükerrer lead kontrolü.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          phone: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!, $phone: String, $email: String) {
            leads(where: {
              product_id: {_eq: $product_id},
              _or: [
                {phone: {_eq: $phone}},
                {email: {_eq: $email}}
              ]
            }) { ${LEAD_FIELDS} }
          }`,
          variables: { product_id: args.product_id, phone: args.phone || null, email: args.email || null },
        })
      },
    },

    // GET_LEAD_HISTORY
    {
      name: 'crm_leads_history',
      description: 'Lead değişiklik geçmişi (audit trail).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
        },
        required: ['product_id', 'lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($lead_id: uuid!, $product_id: uuid!) {
            lead_history(
              where: {lead_id: {_eq: $lead_id}, product_id: {_eq: $product_id}}
              order_by: {changed_at: desc}
            ) { id lead_id product_id field_name old_value new_value changed_by changed_at }
          }`,
          variables: { lead_id: args.lead_id, product_id: args.product_id },
        })
      },
    },

    // GET_LEAD_EXTENDED_MODULES
    {
      name: 'crm_leads_extended_fields',
      description: 'Lead için genişletilmiş modül alanları.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['lead_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($lead_id: uuid!, $product_id: uuid!) {
            extended_field_values(where: {record_id: {_eq: $lead_id}, record_type: {_eq: "lead"}}) {
              id record_id record_type module_id field_id value created_at
              module_field { id field_name field_key field_type ui_type is_required enum_options default_value help_text color field_order }
            }
            modules(where: {product_id: {_eq: $product_id}, is_extended_module: {_eq: true}, extends_table: {_eq: "leads"}}) {
              id name display_name
              module_fields(order_by: {field_order: asc}) { id field_name field_key field_type ui_type is_required enum_options default_value help_text color field_order }
            }
          }`,
          variables: { lead_id: args.lead_id, product_id: args.product_id },
        })
      },
    },

    // GET_TRIAL_HISTORY
    {
      name: 'crm_leads_trial_history',
      description: 'Trial durumu değişiklik geçmişi.',
      inputSchema: {
        type: 'object' as const,
        properties: { product_id: { type: 'string', description: 'Ürün ID (zorunlu)' } },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!) {
            lead_history(
              where: {product_id: {_eq: $product_id}, field_name: {_in: ["sell_status", "trial_duration", "trial_start_date"]}}
              order_by: {changed_at: desc}
            ) { id lead_id field_name old_value new_value changed_by changed_at }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // CREATE_LEAD
    {
      name: 'crm_leads_create',
      description: 'Yeni lead oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          name: { type: 'string', description: 'İsim (zorunlu)' },
          phone: { type: 'string' }, email: { type: 'string' },
          country_code: { type: 'number', description: 'Varsayılan: 90' },
          source: { type: 'string', description: 'INSTAGRAM, WHATSAPP, CALL, MAIL, WEBSITE, CONFERENCE, REFERENCE, YOUTUBE, GOOGLE_ADS, WEBINAR, DIGER' },
          lead_message: { type: 'string' },
          sell_status: { type: 'string', description: 'Varsayılan: NEW_LEAD' },
          assigned_member_id: { type: 'string' },
          assigned_note: { type: 'string' },
          affiliate_id: { type: 'string' },
          trial_duration: { type: 'number' },
          trial_start_date: { type: 'string' },
        },
        required: ['product_id', 'name'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: leads_insert_input!) {
            insert_leads_one(object: $input) { ${LEAD_FIELDS} }
          }`,
          variables: { input: args },
        })
      },
    },

    // UPDATE_LEAD
    {
      name: 'crm_leads_update',
      description: 'Lead güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
          name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' },
          country_code: { type: 'number' }, source: { type: 'string' },
          lead_message: { type: 'string' }, sell_status: { type: 'string' },
          assigned_member_id: { type: 'string' }, assigned_note: { type: 'string' },
          rejection_reason: { type: 'string' }, affiliate_id: { type: 'string' },
          trial_duration: { type: 'number' }, trial_start_date: { type: 'string' },
        },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { lead_id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: leads_set_input!) {
            update_leads_by_pk(pk_columns: {id: $id}, _set: $input) { ${LEAD_FIELDS} }
          }`,
          variables: { id: lead_id, input },
        })
      },
    },

    // UPDATE_LEAD_SELL_STATUS
    {
      name: 'crm_leads_update_status',
      description: 'Lead durumunu hızlıca değiştir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
          sell_status: { type: 'string', description: 'Yeni durum (zorunlu)' },
        },
        required: ['lead_id', 'sell_status'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $sell_status: String!) {
            update_leads_by_pk(pk_columns: {id: $id}, _set: {sell_status: $sell_status}) { id sell_status }
          }`,
          variables: { id: args.lead_id, sell_status: args.sell_status },
        })
      },
    },

    // DELETE_LEAD
    {
      name: 'crm_leads_delete',
      description: 'Lead kalıcı sil.',
      inputSchema: {
        type: 'object' as const,
        properties: { lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' } },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) { delete_leads_by_pk(id: $id) { id name } }`,
          variables: { id: args.lead_id },
        })
      },
    },

    // SOFT_DELETE_LEAD
    {
      name: 'crm_leads_soft_delete',
      description: 'Lead yumuşak sil (geri alınabilir).',
      inputSchema: {
        type: 'object' as const,
        properties: { lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' } },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            update_leads_by_pk(pk_columns: {id: $id}, _set: {is_deleted: true}) { id is_deleted }
          }`,
          variables: { id: args.lead_id },
        })
      },
    },

    // RESTORE_LEAD
    {
      name: 'crm_leads_restore',
      description: 'Silinmiş lead\'i geri getir.',
      inputSchema: {
        type: 'object' as const,
        properties: { lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' } },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            update_leads_by_pk(pk_columns: {id: $id}, _set: {is_deleted: false}) { id is_deleted }
          }`,
          variables: { id: args.lead_id },
        })
      },
    },

    // DELETE_ALL_LEADS
    {
      name: 'crm_leads_delete_all',
      description: 'Tüm lead\'leri kalıcı sil (dikkatli kullanın!).',
      inputSchema: {
        type: 'object' as const,
        properties: { product_id: { type: 'string', description: 'Ürün ID (zorunlu)' } },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($product_id: uuid!) {
            delete_leads(where: {product_id: {_eq: $product_id}}) { affected_rows }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // SAVE_EXTENDED_FIELD_VALUES (for leads)
    {
      name: 'crm_leads_save_extended_fields',
      description: 'Lead için genişletilmiş alan değerlerini kaydet/güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          values: {
            type: 'array',
            description: 'Değer listesi: [{record_id, record_type: "lead", module_id, field_id, value}]',
            items: { type: 'object' },
          },
        },
        required: ['values'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($values: [extended_field_values_insert_input!]!) {
            insert_extended_field_values(
              objects: $values
              on_conflict: {constraint: extended_field_values_record_id_record_type_module_id_field_id_key, update_columns: [value]}
            ) { returning { id record_id field_id value } }
          }`,
          variables: { values: args.values },
        })
      },
    },

    // Lead stats (aggregate — dashboard'da çeşitli yerlerde kullanılıyor)
    {
      name: 'crm_leads_stats',
      description: 'Lead istatistikleri — duruma ve kaynağa göre sayılar, dönüşüm oranı.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          created_after: { type: 'string', description: 'ISO tarih (opsiyonel)' },
          created_before: { type: 'string', description: 'ISO tarih (opsiyonel)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const where: Record<string, unknown> = {
          product_id: { _eq: args.product_id },
          is_deleted: { _eq: false },
        }
        if (args.created_after || args.created_before) {
          const created_at: Record<string, unknown> = {}
          if (args.created_after) created_at._gte = args.created_after
          if (args.created_before) created_at._lte = args.created_before
          where.created_at = created_at
        }

        return hasura.query({
          query: `query($where: leads_bool_exp!) {
            total: leads_aggregate(where: $where) { aggregate { count } }
            by_status: leads(where: $where, distinct_on: sell_status) { sell_status }
            new_lead: leads_aggregate(where: {_and: [$where, {sell_status: {_eq: "NEW_LEAD"}}]}) { aggregate { count } }
            trial: leads_aggregate(where: {_and: [$where, {sell_status: {_eq: "TRIAL"}}]}) { aggregate { count } }
            high_potential: leads_aggregate(where: {_and: [$where, {sell_status: {_eq: "HIGH_POTENTIAL"}}]}) { aggregate { count } }
            low_potential: leads_aggregate(where: {_and: [$where, {sell_status: {_eq: "LOW_POTENTIAL"}}]}) { aggregate { count } }
            in_follow_up: leads_aggregate(where: {_and: [$where, {sell_status: {_eq: "IN_FOLLOW_UP"}}]}) { aggregate { count } }
            success: leads_aggregate(where: {_and: [$where, {sell_status: {_eq: "SUCCESS_LEAD"}}]}) { aggregate { count } }
            rejected: leads_aggregate(where: {_and: [$where, {sell_status: {_eq: "REJECTED"}}]}) { aggregate { count } }
            suspended: leads_aggregate(where: {_and: [$where, {sell_status: {_eq: "SUSPENDED"}}]}) { aggregate { count } }
            returning: leads_aggregate(where: {_and: [$where, {sell_status: {_eq: "RETURNING_LEAD"}}]}) { aggregate { count } }
            by_instagram: leads_aggregate(where: {_and: [$where, {source: {_eq: "INSTAGRAM"}}]}) { aggregate { count } }
            by_whatsapp: leads_aggregate(where: {_and: [$where, {source: {_eq: "WHATSAPP"}}]}) { aggregate { count } }
            by_website: leads_aggregate(where: {_and: [$where, {source: {_eq: "WEBSITE"}}]}) { aggregate { count } }
            by_call: leads_aggregate(where: {_and: [$where, {source: {_eq: "CALL"}}]}) { aggregate { count } }
            by_reference: leads_aggregate(where: {_and: [$where, {source: {_eq: "REFERENCE"}}]}) { aggregate { count } }
            by_google_ads: leads_aggregate(where: {_and: [$where, {source: {_eq: "GOOGLE_ADS"}}]}) { aggregate { count } }
            by_mail: leads_aggregate(where: {_and: [$where, {source: {_eq: "MAIL"}}]}) { aggregate { count } }
          }`,
          variables: { where },
        })
      },
    },
  ]
}
