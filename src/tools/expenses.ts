/**
 * Gider ve gider kategorileri MCP araçları.
 * Tüm sorgular $variable sözdizimi kullanır — string interpolasyon yok.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'

const EXPENSE_FIELDS = `id product_id title description amount expense_date payment_date
  payment_method invoice_number vendor_name vendor_contact receipt_url
  is_recurring recurring_period status approval_status approved_by approved_at
  rejection_reason tags category_id created_by created_at updated_at
  expense_category { id name description color }`

const CATEGORY_FIELDS = `id name description color is_active created_at updated_at`

export function createExpenseTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── GET_EXPENSES ──
    {
      name: 'crm_expenses_list',
      description: 'Giderleri listeler — kategori, onay durumu, filtre ve sayfalama destekli.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          category_id: { type: 'string', description: 'Kategori UUID ile filtrele' },
          status: { type: 'string', description: 'Durum filtresi: pending, approved, rejected' },
          expense_after: { type: 'string', description: 'Başlangıç tarihi (YYYY-MM-DD)' },
          expense_before: { type: 'string', description: 'Bitiş tarihi (YYYY-MM-DD)' },
          limit: { type: 'number', description: 'Maks sonuç (varsayılan: 50)' },
          offset: { type: 'number', description: 'Sayfalama offset' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const where: Record<string, unknown> = {
          product_id: { _eq: args.product_id },
        }
        if (args.category_id) where.category_id = { _eq: args.category_id }
        if (args.status) where.status = { _eq: args.status }
        if (args.expense_after || args.expense_before) {
          const expense_date: Record<string, unknown> = {}
          if (args.expense_after) expense_date._gte = args.expense_after
          if (args.expense_before) expense_date._lte = args.expense_before
          where.expense_date = expense_date
        }
        return hasura.query({
          query: `query($where: expenses_bool_exp!, $limit: Int, $offset: Int) {
            expenses(where: $where, order_by: {expense_date: desc}, limit: $limit, offset: $offset) {
              ${EXPENSE_FIELDS}
            }
            expenses_aggregate(where: $where) {
              aggregate { count sum { amount } }
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

    // ── GET_EXPENSE_BY_ID ──
    {
      name: 'crm_expenses_get',
      description: 'Tek bir gider kaydının detayını getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Gider UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($id: uuid!, $product_id: uuid!) {
            expenses(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}) {
              ${EXPENSE_FIELDS}
            }
          }`,
          variables: { id: args.id, product_id: args.product_id },
        })
      },
    },

    // ── GET_EXPENSE_CATEGORIES ──
    {
      name: 'crm_expense_categories_list',
      description: 'Gider kategorilerini listeler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID' },
          is_active: { type: 'boolean', description: 'Aktif olanları filtrele' },
        },
        required: [],
      },
      handler: async (args: Record<string, unknown>) => {
        const where: Record<string, unknown> = {}
        if (args.product_id) where.product_id = { _eq: args.product_id }
        if (args.is_active !== undefined) where.is_active = { _eq: args.is_active }
        return hasura.query({
          query: `query($where: expense_categories_bool_exp) {
            expense_categories(where: $where, order_by: {name: asc}) {
              ${CATEGORY_FIELDS}
            }
          }`,
          variables: { where: Object.keys(where).length > 0 ? where : undefined },
        })
      },
    },

    // ── GET_EXPENSE_STATISTICS ──
    {
      name: 'crm_expenses_statistics',
      description: 'Gider istatistikleri — duruma, kategoriye ve aya göre toplamlar.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          date_from: { type: 'string', description: 'Başlangıç tarihi (YYYY-MM-DD)' },
          date_to: { type: 'string', description: 'Bitiş tarihi (YYYY-MM-DD)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const where: Record<string, unknown> = {
          product_id: { _eq: args.product_id },
        }
        if (args.date_from || args.date_to) {
          const expense_date: Record<string, unknown> = {}
          if (args.date_from) expense_date._gte = args.date_from
          if (args.date_to) expense_date._lte = args.date_to
          where.expense_date = expense_date
        }
        return hasura.query({
          query: `query($where: expenses_bool_exp!, $where_approved: expenses_bool_exp!, $where_pending: expenses_bool_exp!, $where_rejected: expenses_bool_exp!) {
            total: expenses_aggregate(where: $where) {
              aggregate { count sum { amount } avg { amount } }
            }
            approved: expenses_aggregate(where: $where_approved) {
              aggregate { count sum { amount } }
            }
            pending: expenses_aggregate(where: $where_pending) {
              aggregate { count sum { amount } }
            }
            rejected: expenses_aggregate(where: $where_rejected) {
              aggregate { count sum { amount } }
            }
            by_category: expenses(where: $where, distinct_on: category_id) {
              category_id
              expense_category { id name color }
            }
          }`,
          variables: {
            where,
            where_approved: { ...where, approval_status: { _eq: 'approved' } },
            where_pending: { ...where, approval_status: { _eq: 'pending' } },
            where_rejected: { ...where, approval_status: { _eq: 'rejected' } },
          },
        })
      },
    },

    // ── CREATE_EXPENSE ──
    {
      name: 'crm_expenses_create',
      description: 'Yeni gider kaydı oluşturur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          title: { type: 'string', description: 'Gider başlığı (zorunlu)' },
          amount: { type: 'number', description: 'Tutar (zorunlu)' },
          expense_date: { type: 'string', description: 'Gider tarihi YYYY-MM-DD (zorunlu)' },
          category_id: { type: 'string', description: 'Kategori UUID' },
          description: { type: 'string', description: 'Açıklama' },
          payment_method: { type: 'string', description: 'Ödeme yöntemi' },
          payment_date: { type: 'string', description: 'Ödeme tarihi YYYY-MM-DD' },
          invoice_number: { type: 'string', description: 'Fatura numarası' },
          vendor_name: { type: 'string', description: 'Tedarikçi adı' },
          vendor_contact: { type: 'string', description: 'Tedarikçi iletişim' },
          receipt_url: { type: 'string', description: 'Makbuz URL' },
          is_recurring: { type: 'boolean', description: 'Tekrarlayan gider mi' },
          recurring_period: { type: 'string', description: 'Tekrar periyodu' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Etiketler' },
          created_by: { type: 'string', description: 'Oluşturan kullanıcı' },
        },
        required: ['product_id', 'title', 'amount', 'expense_date'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: expenses_insert_input!) {
            insert_expenses_one(object: $input) {
              ${EXPENSE_FIELDS}
            }
          }`,
          variables: { input: args },
        })
      },
    },

    // ── UPDATE_EXPENSE ──
    {
      name: 'crm_expenses_update',
      description: 'Gider kaydını günceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Gider UUID (zorunlu)' },
          title: { type: 'string' },
          amount: { type: 'number' },
          expense_date: { type: 'string' },
          category_id: { type: 'string' },
          description: { type: 'string' },
          payment_method: { type: 'string' },
          payment_date: { type: 'string' },
          invoice_number: { type: 'string' },
          vendor_name: { type: 'string' },
          vendor_contact: { type: 'string' },
          receipt_url: { type: 'string' },
          is_recurring: { type: 'boolean' },
          recurring_period: { type: 'string' },
          status: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: expenses_set_input!) {
            update_expenses_by_pk(pk_columns: {id: $id}, _set: $input) {
              ${EXPENSE_FIELDS}
            }
          }`,
          variables: { id, input },
        })
      },
    },

    // ── DELETE_EXPENSE ──
    {
      name: 'crm_expenses_delete',
      description: 'Gider kaydını siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Gider UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_expenses_by_pk(id: $id) { id title }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── APPROVE_EXPENSE ──
    {
      name: 'crm_expenses_approve',
      description: 'Gideri onaylar.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Gider UUID (zorunlu)' },
          approved_by: { type: 'string', description: 'Onaylayan kişi (zorunlu)' },
        },
        required: ['id', 'approved_by'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $approved_by: String!) {
            update_expenses_by_pk(
              pk_columns: {id: $id}
              _set: {approval_status: "approved", approved_by: $approved_by, approved_at: "now()"}
            ) {
              id title approval_status approved_by approved_at
            }
          }`,
          variables: { id: args.id, approved_by: args.approved_by },
        })
      },
    },

    // ── REJECT_EXPENSE ──
    {
      name: 'crm_expenses_reject',
      description: 'Gideri reddeder.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Gider UUID (zorunlu)' },
          rejection_reason: { type: 'string', description: 'Ret nedeni (zorunlu)' },
        },
        required: ['id', 'rejection_reason'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $rejection_reason: String!) {
            update_expenses_by_pk(
              pk_columns: {id: $id}
              _set: {approval_status: "rejected", rejection_reason: $rejection_reason}
            ) {
              id title approval_status rejection_reason
            }
          }`,
          variables: { id: args.id, rejection_reason: args.rejection_reason },
        })
      },
    },

    // ── CREATE_EXPENSE_CATEGORY ──
    {
      name: 'crm_expense_categories_create',
      description: 'Yeni gider kategorisi oluşturur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Kategori adı (zorunlu)' },
          description: { type: 'string', description: 'Açıklama' },
          color: { type: 'string', description: 'Hex renk kodu' },
          product_id: { type: 'string', description: 'Ürün ID' },
        },
        required: ['name'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: expense_categories_insert_input!) {
            insert_expense_categories_one(object: $input) {
              ${CATEGORY_FIELDS}
            }
          }`,
          variables: { input: args },
        })
      },
    },

    // ── UPDATE_EXPENSE_CATEGORY ──
    {
      name: 'crm_expense_categories_update',
      description: 'Gider kategorisini günceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kategori UUID (zorunlu)' },
          name: { type: 'string', description: 'Kategori adı' },
          description: { type: 'string', description: 'Açıklama' },
          color: { type: 'string', description: 'Hex renk kodu' },
          is_active: { type: 'boolean', description: 'Aktif mi' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: expense_categories_set_input!) {
            update_expense_categories_by_pk(pk_columns: {id: $id}, _set: $input) {
              ${CATEGORY_FIELDS}
            }
          }`,
          variables: { id, input },
        })
      },
    },

    // ── DELETE_EXPENSE_CATEGORY ──
    {
      name: 'crm_expense_categories_delete',
      description: 'Gider kategorisini siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kategori UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_expense_categories_by_pk(id: $id) { id name }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── BULK_UPDATE_EXPENSE_STATUS ──
    {
      name: 'crm_expenses_bulk_update_status',
      description: 'Birden fazla giderin durumunu toplu günceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'Gider UUID listesi (zorunlu)' },
          status: { type: 'string', description: 'Yeni durum (zorunlu)' },
        },
        required: ['ids', 'status'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($ids: [uuid!]!, $status: String!) {
            update_expenses(where: {id: {_in: $ids}}, _set: {status: $status}) {
              affected_rows
              returning { id title status }
            }
          }`,
          variables: { ids: args.ids, status: args.status },
        })
      },
    },

    // ── BULK_DELETE_EXPENSES ──
    {
      name: 'crm_expenses_bulk_delete',
      description: 'Birden fazla gideri toplu siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'Gider UUID listesi (zorunlu)' },
        },
        required: ['ids'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($ids: [uuid!]!) {
            delete_expenses(where: {id: {_in: $ids}}) {
              affected_rows
            }
          }`,
          variables: { ids: args.ids },
        })
      },
    },
  ]
}
