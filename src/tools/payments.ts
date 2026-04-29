/**
 * Odeme, taksit ve indirim MCP araclari.
 * Tum sorgular GraphQL $variable sozdizimi kullanir — string interpolation yok.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'

export function createPaymentTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ── Odemeleri Listele ──
    {
      name: 'crm_payments_list',
      description: 'Belirli bir urune ait tum odemeleri taksit ve indirim detaylariyla listeler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Urun UUID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($product_id: uuid!) {
            payments(where: {product_id: {_eq: $product_id}}, order_by: {created_at: desc}) {
              id product_id lead_id name description phone country_code email total_amount note created_at updated_at affiliate_id
              lead { id name phone email sell_status }
              payment_details(order_by: {due_date: asc}) {
                id payment_id due_date amount paid_amount status payment_date note payment_type created_at updated_at
              }
              payment_discounts {
                id payment_id discount_type discount_value discount_reason applied_by_member_id created_at updated_at
              }
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── Tek Odeme Getir ──
    {
      name: 'crm_payments_get',
      description: 'Belirli bir odemeyi tum taksit, indirim ve lead detaylariyla getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Odeme UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Urun UUID (zorunlu)' },
        },
        required: ['id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($id: uuid!, $product_id: uuid!) {
            payments(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}) {
              id product_id lead_id name description phone country_code email total_amount note created_at updated_at affiliate_id
              lead { id name phone email sell_status }
              payment_details(order_by: {due_date: asc}) {
                id payment_id due_date amount paid_amount status payment_date note payment_type created_at updated_at
              }
              payment_discounts {
                id payment_id discount_type discount_value discount_reason applied_by_member_id created_at updated_at
              }
            }
          }`,
          variables: { id: args.id, product_id: args.product_id },
        })
      },
    },

    // ── Lead'e Ait Odemeleri Getir ──
    {
      name: 'crm_payments_by_lead',
      description: 'Belirli bir lead\'e ait tum odemeleri getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Urun UUID (zorunlu)' },
        },
        required: ['lead_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($lead_id: uuid!, $product_id: uuid!) {
            payments(where: {lead_id: {_eq: $lead_id}, product_id: {_eq: $product_id}}, order_by: {created_at: desc}) {
              id product_id lead_id name description phone country_code email total_amount note created_at updated_at affiliate_id
              lead { id name phone email sell_status }
              payment_details(order_by: {due_date: asc}) {
                id payment_id due_date amount paid_amount status payment_date note payment_type created_at updated_at
              }
              payment_discounts {
                id payment_id discount_type discount_value discount_reason applied_by_member_id created_at updated_at
              }
            }
          }`,
          variables: { lead_id: args.lead_id, product_id: args.product_id },
        })
      },
    },

    // ── Odeme Taksitlerini Getir ──
    {
      name: 'crm_payment_details_list',
      description: 'Belirli bir odemeye ait tum taksit detaylarini getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          payment_id: { type: 'string', description: 'Odeme UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Urun UUID (zorunlu)' },
        },
        required: ['payment_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($payment_id: uuid!, $product_id: uuid!) {
            payment_details(
              where: {payment_id: {_eq: $payment_id}, payment: {product_id: {_eq: $product_id}}},
              order_by: {due_date: asc}
            ) {
              id payment_id due_date amount paid_amount status payment_date note payment_type created_at updated_at
            }
          }`,
          variables: { payment_id: args.payment_id, product_id: args.product_id },
        })
      },
    },

    // ── Odeme Indirimlerini Getir ──
    {
      name: 'crm_payment_discounts_list',
      description: 'Belirli bir odemeye ait tum indirimleri getirir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          payment_id: { type: 'string', description: 'Odeme UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Urun UUID (zorunlu)' },
        },
        required: ['payment_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `query($payment_id: uuid!, $product_id: uuid!) {
            payment_discounts(
              where: {payment_id: {_eq: $payment_id}, payment: {product_id: {_eq: $product_id}}}
            ) {
              id payment_id discount_type discount_value discount_reason applied_by_member_id created_at updated_at
            }
          }`,
          variables: { payment_id: args.payment_id, product_id: args.product_id },
        })
      },
    },

    // ── Odeme Olustur ──
    {
      name: 'crm_payments_create',
      description: 'Yeni bir odeme kaydi olusturur. product_id, name, total_amount zorunludur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'payments_insert_input nesnesi (product_id, name, total_amount, lead_id, description, phone, country_code, email, note, affiliate_id)',
          },
        },
        required: ['input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: payments_insert_input!) {
            insert_payments_one(object: $input) {
              id product_id lead_id name description phone country_code email total_amount note created_at updated_at affiliate_id
            }
          }`,
          variables: { input: args.input },
        })
      },
    },

    // ── Odeme Guncelle ──
    {
      name: 'crm_payments_update',
      description: 'Mevcut bir odeme kaydini gunceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Odeme UUID (zorunlu)' },
          input: {
            type: 'object',
            description: 'payments_set_input nesnesi (name, description, total_amount, note, phone, email, country_code, affiliate_id)',
          },
        },
        required: ['id', 'input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $input: payments_set_input!) {
            update_payments_by_pk(pk_columns: {id: $id}, _set: $input) {
              id product_id lead_id name description phone country_code email total_amount note created_at updated_at affiliate_id
            }
          }`,
          variables: { id: args.id, input: args.input },
        })
      },
    },

    // ── Odeme Sil ──
    {
      name: 'crm_payments_delete',
      description: 'Bir odeme kaydini kalici olarak siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Odeme UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_payments_by_pk(id: $id) {
              id
            }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── Taksit Olustur ──
    {
      name: 'crm_payment_details_create',
      description: 'Bir odemeye yeni taksit/odeme detayi ekler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'payment_details_insert_input nesnesi (payment_id, due_date, amount, paid_amount, status, payment_type, payment_date, note)',
          },
        },
        required: ['input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: payment_details_insert_input!) {
            insert_payment_details_one(object: $input) {
              id payment_id due_date amount paid_amount status payment_date note payment_type created_at updated_at
            }
          }`,
          variables: { input: args.input },
        })
      },
    },

    // ── Taksit Guncelle ──
    {
      name: 'crm_payment_details_update',
      description: 'Bir taksit detayini gunceller (odendi olarak isaretle, tarih degistir vb.).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Taksit UUID (zorunlu)' },
          input: {
            type: 'object',
            description: 'payment_details_set_input nesnesi (due_date, amount, paid_amount, status, payment_type, payment_date, note)',
          },
        },
        required: ['id', 'input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $input: payment_details_set_input!) {
            update_payment_details_by_pk(pk_columns: {id: $id}, _set: $input) {
              id payment_id due_date amount paid_amount status payment_date note payment_type created_at updated_at
            }
          }`,
          variables: { id: args.id, input: args.input },
        })
      },
    },

    // ── Taksit Sil ──
    {
      name: 'crm_payment_details_delete',
      description: 'Bir taksit detayini kalici olarak siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Taksit UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_payment_details_by_pk(id: $id) {
              id
            }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── Indirim Olustur ──
    {
      name: 'crm_payment_discounts_create',
      description: 'Bir odemeye indirim ekler (yuzde veya sabit tutar).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'payment_discounts_insert_input nesnesi (payment_id, discount_type, discount_value, discount_reason, applied_by_member_id)',
          },
        },
        required: ['input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: payment_discounts_insert_input!) {
            insert_payment_discounts_one(object: $input) {
              id payment_id discount_type discount_value discount_reason applied_by_member_id created_at updated_at
            }
          }`,
          variables: { input: args.input },
        })
      },
    },

    // ── Indirim Guncelle ──
    {
      name: 'crm_payment_discounts_update',
      description: 'Bir odeme indirimini gunceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Indirim UUID (zorunlu)' },
          input: {
            type: 'object',
            description: 'payment_discounts_set_input nesnesi (discount_type, discount_value, discount_reason)',
          },
        },
        required: ['id', 'input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $input: payment_discounts_set_input!) {
            update_payment_discounts_by_pk(pk_columns: {id: $id}, _set: $input) {
              id payment_id discount_type discount_value discount_reason applied_by_member_id created_at updated_at
            }
          }`,
          variables: { id: args.id, input: args.input },
        })
      },
    },

    // ── Indirim Sil ──
    {
      name: 'crm_payment_discounts_delete',
      description: 'Bir odeme indirimini kalici olarak siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Indirim UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_payment_discounts_by_pk(id: $id) {
              id
            }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── Tum Odemeleri Sil (Urun Bazli) ──
    {
      name: 'crm_payments_delete_all',
      description: 'Belirli bir urune ait tum odemeleri toplu olarak siler. Dikkatli kullanin.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Urun UUID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($product_id: uuid!) {
            delete_payments(where: {product_id: {_eq: $product_id}}) {
              affected_rows
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },
  ]
}
