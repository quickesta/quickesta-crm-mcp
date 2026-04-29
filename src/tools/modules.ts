/**
 * Dinamik modüller, alanlar, kayıtlar ve genişletilmiş alan değerleri MCP araçları.
 * Tüm sorgular $variable sözdizimi kullanır — string interpolasyon yok.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'

const MODULE_FIELDS = `id product_id name display_name is_extended_module extends_table created_at
  module_fields(order_by: {field_order: asc}) {
    id field_name field_key field_type ui_type is_required enum_options default_value help_text color field_order min_value max_value min_length max_length
  }
  module_fields_aggregate { aggregate { count } }
  dynamic_module_records_aggregate { aggregate { count } }`

const FIELD_COLUMNS = `id field_name field_key field_type ui_type is_required enum_options default_value help_text color field_order min_value max_value min_length max_length created_at`

const RECORD_WITH_VALUES = `id module_id product_id created_at
  module_field_values { id field_id value module_field { field_name field_key field_type } }`

export function createModuleTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── GET_MODULES ──
    {
      name: 'crm_modules_list',
      description: 'Ürüne ait tüm özel modülleri listeler — alan tanımları, kayıt sayısı dahil.',
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
            modules(where: {product_id: {_eq: $product_id}}, order_by: {created_at: desc}) {
              ${MODULE_FIELDS}
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── GET_MODULE_BY_ID ──
    {
      name: 'crm_modules_get',
      description: 'Tek bir modülün detayını getirir — alanlar ve kayıt sayısı dahil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Modül UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($id: uuid!, $product_id: uuid!) {
            modules(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}) {
              ${MODULE_FIELDS}
            }
          }`,
          variables: { id: args.id, product_id: args.product_id },
        })
      },
    },

    // ── GET_MODULE_WITH_RECORDS ──
    {
      name: 'crm_modules_get_with_records',
      description: 'Modül detayı ile birlikte kayıtlarını ve alan değerlerini getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['module_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($module_id: uuid!, $product_id: uuid!) {
            modules(where: {id: {_eq: $module_id}, product_id: {_eq: $product_id}}) {
              ${MODULE_FIELDS}
            }
            dynamic_module_records(where: {module_id: {_eq: $module_id}, product_id: {_eq: $product_id}}, order_by: {created_at: desc}) {
              ${RECORD_WITH_VALUES}
            }
          }`,
          variables: { module_id: args.module_id, product_id: args.product_id },
        })
      },
    },

    // ── GET_MODULE_RECORDS ──
    {
      name: 'crm_module_records_list',
      description: 'Bir modülün kayıtlarını alan değerleriyle birlikte listeler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          limit: { type: 'number', description: 'Maks sonuç (varsayılan: 50)' },
          offset: { type: 'number', description: 'Sayfalama offset' },
        },
        required: ['module_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($module_id: uuid!, $product_id: uuid!, $limit: Int, $offset: Int) {
            dynamic_module_records(
              where: {module_id: {_eq: $module_id}, product_id: {_eq: $product_id}}
              order_by: {created_at: desc}
              limit: $limit
              offset: $offset
            ) {
              ${RECORD_WITH_VALUES}
            }
            dynamic_module_records_aggregate(where: {module_id: {_eq: $module_id}, product_id: {_eq: $product_id}}) {
              aggregate { count }
            }
          }`,
          variables: {
            module_id: args.module_id,
            product_id: args.product_id,
            limit: Math.min(Number(args.limit) || 50, 200),
            offset: Number(args.offset) || 0,
          },
        })
      },
    },

    // ── GET_MODULE_RECORD_BY_ID ──
    {
      name: 'crm_module_records_get',
      description: 'Tek bir modül kaydını alan değerleriyle birlikte getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kayıt UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($id: uuid!, $product_id: uuid!) {
            dynamic_module_records(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}) {
              ${RECORD_WITH_VALUES}
            }
          }`,
          variables: { id: args.id, product_id: args.product_id },
        })
      },
    },

    // ── GET_MODULE_FIELD_VALUES ──
    {
      name: 'crm_module_field_values_list',
      description: 'Belirli kayıtların alan değerlerini toplu olarak getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
          record_ids: { type: 'array', items: { type: 'string' }, description: 'Kayıt UUID listesi (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['module_id', 'record_ids', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($module_id: uuid!, $record_ids: [uuid!]!, $product_id: uuid!) {
            module_field_values(
              where: {module_id: {_eq: $module_id}, record_id: {_in: $record_ids}, product_id: {_eq: $product_id}}
            ) {
              id record_id field_id value created_at
              module_field { field_name field_key field_type ui_type }
            }
          }`,
          variables: { module_id: args.module_id, record_ids: args.record_ids, product_id: args.product_id },
        })
      },
    },

    // ── GET_MODULE_FIELD_VALUES_BY_RECORD ──
    {
      name: 'crm_module_field_values_by_record',
      description: 'Tek bir kaydın tüm alan değerlerini getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          record_id: { type: 'string', description: 'Kayıt UUID (zorunlu)' },
        },
        required: ['record_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($record_id: uuid!) {
            module_field_values(where: {record_id: {_eq: $record_id}}) {
              id record_id field_id value created_at
              module_field { field_name field_key field_type ui_type is_required enum_options }
            }
          }`,
          variables: { record_id: args.record_id },
        })
      },
    },

    // ── GET_MODULE_FIELDS ──
    {
      name: 'crm_module_fields_list',
      description: 'Bir modülün alan tanımlarını sıralı şekilde listeler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
        },
        required: ['module_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($module_id: uuid!) {
            module_fields(where: {module_id: {_eq: $module_id}}, order_by: {field_order: asc}) {
              ${FIELD_COLUMNS}
            }
          }`,
          variables: { module_id: args.module_id },
        })
      },
    },

    // ── GET_EXTENDED_FIELD_VALUES ──
    {
      name: 'crm_extended_field_values_get',
      description: 'Bir kaydın genişletilmiş modül alan değerlerini getirir (lead veya payment).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          record_id: { type: 'string', description: 'Kayıt UUID (zorunlu)' },
          record_type: { type: 'string', description: 'Kayıt tipi: lead veya payment (zorunlu)' },
        },
        required: ['record_id', 'record_type'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($record_id: uuid!, $record_type: String!) {
            extended_field_values(where: {record_id: {_eq: $record_id}, record_type: {_eq: $record_type}}) {
              id record_id record_type module_id field_id value created_at
              module_field { id field_name field_key field_type ui_type is_required enum_options default_value help_text color field_order }
            }
          }`,
          variables: { record_id: args.record_id, record_type: args.record_type },
        })
      },
    },

    // ── SEARCH_MODULE_RECORDS ──
    {
      name: 'crm_module_records_search',
      description: 'Modül kayıtlarında alan değerlerine göre arama yapar.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
          search_term: { type: 'string', description: 'Arama terimi (zorunlu)' },
        },
        required: ['module_id', 'search_term'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($module_id: uuid!, $search_term: String!) {
            dynamic_module_records(
              where: {
                module_id: {_eq: $module_id},
                module_field_values: {value: {_ilike: $search_term}}
              }
              order_by: {created_at: desc}
            ) {
              ${RECORD_WITH_VALUES}
            }
          }`,
          variables: {
            module_id: args.module_id,
            search_term: `%${args.search_term}%`,
          },
        })
      },
    },

    // ── CREATE_MODULE ──
    {
      name: 'crm_modules_create',
      description: 'Yeni özel modül oluşturur (bağımsız veya lead/payment genişletici).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          name: { type: 'string', description: 'Modül adı (zorunlu)' },
          display_name: { type: 'string', description: 'Görünen ad (zorunlu)' },
          is_extended_module: { type: 'boolean', description: 'Genişletici modül mü (varsayılan: false)' },
          extends_table: { type: 'string', description: 'Genişletilen tablo: leads veya payments' },
        },
        required: ['product_id', 'name', 'display_name'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: modules_insert_input!) {
            insert_modules_one(object: $input) {
              id product_id name display_name is_extended_module extends_table created_at
            }
          }`,
          variables: { input: args },
        })
      },
    },

    // ── UPDATE_MODULE ──
    {
      name: 'crm_modules_update',
      description: 'Modül bilgilerini günceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Modül UUID (zorunlu)' },
          name: { type: 'string', description: 'Yeni modül adı' },
          display_name: { type: 'string', description: 'Yeni görünen ad' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: modules_set_input!) {
            update_modules_by_pk(pk_columns: {id: $id}, _set: $input) {
              id name display_name is_extended_module extends_table
            }
          }`,
          variables: { id, input },
        })
      },
    },

    // ── DELETE_MODULE_WITH_DEPENDENCIES ──
    {
      name: 'crm_modules_delete',
      description: 'Modülü tüm bağımlılıklarıyla birlikte siler (alan değerleri, kayıtlar, alanlar).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Modül UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_module_field_values(where: {module_id: {_eq: $id}}) { affected_rows }
            delete_extended_field_values(where: {module_id: {_eq: $id}}) { affected_rows }
            delete_dynamic_module_records(where: {module_id: {_eq: $id}}) { affected_rows }
            delete_module_fields(where: {module_id: {_eq: $id}}) { affected_rows }
            delete_modules_by_pk(id: $id) { id }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── CREATE_MODULE_FIELD ──
    {
      name: 'crm_module_fields_create',
      description: 'Modüle yeni bir alan ekler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
          field_name: { type: 'string', description: 'Alan adı (zorunlu)' },
          field_key: { type: 'string', description: 'Alan anahtarı (zorunlu)' },
          field_type: { type: 'string', description: 'text, number, email, phone, date, datetime, boolean, enum, radio, textarea, url (zorunlu)' },
          ui_type: { type: 'string', description: 'input, textarea, select, radio, checkbox, date_picker vb. (zorunlu)' },
          is_required: { type: 'boolean', description: 'Zorunlu alan mı' },
          enum_options: { type: 'array', items: { type: 'string' }, description: 'Seçenek listesi (enum/radio için)' },
          default_value: { type: 'string', description: 'Varsayılan değer' },
          help_text: { type: 'string', description: 'Yardım metni' },
          color: { type: 'string', description: 'Alan rengi' },
          field_order: { type: 'number', description: 'Sıralama numarası' },
          min_value: { type: 'number' },
          max_value: { type: 'number' },
          min_length: { type: 'number' },
          max_length: { type: 'number' },
        },
        required: ['product_id', 'module_id', 'field_name', 'field_key', 'field_type', 'ui_type'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: module_fields_insert_input!) {
            insert_module_fields_one(object: $input) {
              ${FIELD_COLUMNS}
            }
          }`,
          variables: { input: args },
        })
      },
    },

    // ── CREATE_MODULE_FIELDS (bulk) ──
    {
      name: 'crm_module_fields_create_bulk',
      description: 'Modüle birden fazla alan toplu ekler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          inputs: {
            type: 'array',
            description: 'Alan tanım listesi (zorunlu)',
            items: { type: 'object' },
          },
        },
        required: ['inputs'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($inputs: [module_fields_insert_input!]!) {
            insert_module_fields(objects: $inputs) {
              returning { ${FIELD_COLUMNS} }
              affected_rows
            }
          }`,
          variables: { inputs: args.inputs },
        })
      },
    },

    // ── UPDATE_MODULE_FIELD ──
    {
      name: 'crm_module_fields_update',
      description: 'Modül alanını günceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Alan UUID (zorunlu)' },
          field_name: { type: 'string' },
          field_type: { type: 'string' },
          ui_type: { type: 'string' },
          is_required: { type: 'boolean' },
          enum_options: { type: 'array', items: { type: 'string' } },
          default_value: { type: 'string' },
          help_text: { type: 'string' },
          color: { type: 'string' },
          field_order: { type: 'number' },
          min_value: { type: 'number' },
          max_value: { type: 'number' },
          min_length: { type: 'number' },
          max_length: { type: 'number' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: module_fields_set_input!) {
            update_module_fields_by_pk(pk_columns: {id: $id}, _set: $input) {
              ${FIELD_COLUMNS}
            }
          }`,
          variables: { id, input },
        })
      },
    },

    // ── DELETE_MODULE_FIELD ──
    {
      name: 'crm_module_fields_delete',
      description: 'Modül alanını ve ona ait değerleri siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Alan UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_module_field_values(where: {field_id: {_eq: $id}}) { affected_rows }
            delete_extended_field_values(where: {field_id: {_eq: $id}}) { affected_rows }
            delete_module_fields_by_pk(id: $id) { id }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── CREATE_MODULE_RECORD ──
    {
      name: 'crm_module_records_create',
      description: 'Modülde yeni kayıt oluşturur ve alan değerlerini ekler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
          field_values: {
            type: 'array',
            description: 'Alan değerleri: [{field_id, value}]',
            items: { type: 'object' },
          },
        },
        required: ['product_id', 'module_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const record = await hasura.query<{ insert_dynamic_module_records_one: { id: string } }>({
          query: `mutation($record_input: dynamic_module_records_insert_input!) {
            insert_dynamic_module_records_one(object: $record_input) { id }
          }`,
          variables: {
            record_input: { product_id: args.product_id, module_id: args.module_id },
          },
        })
        const recordId = record.insert_dynamic_module_records_one.id
        if (Array.isArray(args.field_values) && args.field_values.length > 0) {
          const values = (args.field_values as Array<{ field_id: string; value: string }>).map((fv) => ({
            product_id: args.product_id,
            module_id: args.module_id,
            record_id: recordId,
            field_id: fv.field_id,
            value: fv.value,
          }))
          await hasura.query({
            query: `mutation($values: [module_field_values_insert_input!]!) {
              insert_module_field_values(objects: $values) { affected_rows }
            }`,
            variables: { values },
          })
        }
        return { id: recordId, module_id: args.module_id }
      },
    },

    // ── UPDATE_MODULE_RECORD ──
    {
      name: 'crm_module_records_update',
      description: 'Modül kaydının alan değerlerini günceller (eski değerleri silip yenilerini ekler).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          record_id: { type: 'string', description: 'Kayıt UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
          field_values: {
            type: 'array',
            description: 'Yeni alan değerleri: [{field_id, value}]',
            items: { type: 'object' },
          },
        },
        required: ['record_id', 'product_id', 'module_id', 'field_values'],
      },
      handler: async (args: Record<string, unknown>) => {
        // Eski değerleri sil
        await hasura.query({
          query: `mutation($record_id: uuid!) {
            delete_module_field_values(where: {record_id: {_eq: $record_id}}) { affected_rows }
          }`,
          variables: { record_id: args.record_id },
        })
        // Yeni değerleri ekle
        if (Array.isArray(args.field_values) && args.field_values.length > 0) {
          const values = (args.field_values as Array<{ field_id: string; value: string }>).map((fv) => ({
            product_id: args.product_id,
            module_id: args.module_id,
            record_id: args.record_id,
            field_id: fv.field_id,
            value: fv.value,
          }))
          return hasura.query({
            query: `mutation($values: [module_field_values_insert_input!]!) {
              insert_module_field_values(objects: $values) {
                returning { id record_id field_id value }
                affected_rows
              }
            }`,
            variables: { values },
          })
        }
        return { affected_rows: 0 }
      },
    },

    // ── DELETE_MODULE_RECORD ──
    {
      name: 'crm_module_records_delete',
      description: 'Modül kaydını ve alan değerlerini siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kayıt UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_module_field_values(where: {record_id: {_eq: $id}}) { affected_rows }
            delete_dynamic_module_records_by_pk(id: $id) { id }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── CLEAR_MODULE_RECORDS ──
    {
      name: 'crm_module_records_clear',
      description: 'Bir modülün tüm kayıtlarını ve alan değerlerini temizler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
        },
        required: ['module_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($module_id: uuid!) {
            delete_module_field_values(where: {module_id: {_eq: $module_id}}) { affected_rows }
            delete_dynamic_module_records(where: {module_id: {_eq: $module_id}}) { affected_rows }
          }`,
          variables: { module_id: args.module_id },
        })
      },
    },

    // ── GET_MODULE_PERMISSIONS ──
    {
      name: 'crm_module_permissions_get',
      description: 'Bir rol için modül izinlerini getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          role_id: { type: 'string', description: 'Rol UUID (zorunlu)' },
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
        },
        required: ['role_id', 'module_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($role_id: uuid!, $module_id: uuid!) {
            module_permissions(where: {role_id: {_eq: $role_id}, module_id: {_eq: $module_id}}) {
              id role_id module_id can_view can_create can_edit can_delete created_at updated_at
            }
          }`,
          variables: { role_id: args.role_id, module_id: args.module_id },
        })
      },
    },

    // ── GET_USER_MODULE_PERMISSIONS ──
    {
      name: 'crm_module_permissions_user',
      description: 'Bir kullanıcının modül üzerindeki izinlerini getirir (rol üzerinden).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          member_id: { type: 'string', description: 'Üye UUID (zorunlu)' },
          module_id: { type: 'string', description: 'Modül UUID (zorunlu)' },
        },
        required: ['product_id', 'member_id', 'module_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!, $member_id: uuid!, $module_id: uuid!) {
            members(where: {id: {_eq: $member_id}, product_id: {_eq: $product_id}}) {
              id role_id
              role {
                id name
                module_permissions(where: {module_id: {_eq: $module_id}}) {
                  id module_id can_view can_create can_edit can_delete
                }
              }
            }
          }`,
          variables: { product_id: args.product_id, member_id: args.member_id, module_id: args.module_id },
        })
      },
    },
  ]
}
