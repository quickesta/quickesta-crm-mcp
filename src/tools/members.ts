/**
 * Uye, rol, affiliate ve komisyon MCP araclari.
 * Tum sorgular GraphQL $variable sozdizimi kullanir — string interpolation yok.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'

export function createMemberTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ══════════════════════════════════════════
    //  UYELER (Members)
    // ══════════════════════════════════════════

    // ── Uyeleri Listele ──
    {
      name: 'crm_members_list',
      description: 'Belirli bir urune ait tum takim uyelerini listeler.',
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
            members(where: {product_id: {_eq: $product_id}}) {
              id product_id email name color created_at
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── Uyeleri Rollerle Listele ──
    {
      name: 'crm_members_list_with_roles',
      description: 'Takim uyelerini atanmis rolleriyle birlikte listeler.',
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
            members(where: {product_id: {_eq: $product_id}}) {
              id product_id email name color created_at
              member_roles {
                id product_id
                role { id name description }
              }
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── Uye Olustur ──
    {
      name: 'crm_members_create',
      description: 'Takima yeni bir uye ekler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'members_insert_input nesnesi (id, product_id, email, name, color)',
          },
        },
        required: ['input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: members_insert_input!) {
            insert_members_one(object: $input) {
              id product_id email name color created_at
            }
          }`,
          variables: { input: args.input },
        })
      },
    },

    // ── Uye Guncelle ──
    {
      name: 'crm_members_update',
      description: 'Bir takim uyesinin bilgilerini gunceller. Composite PK: product_id + id.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Urun UUID (zorunlu)' },
          id: { type: 'string', description: 'Uye UUID (zorunlu)' },
          input: {
            type: 'object',
            description: 'members_set_input nesnesi (name, color)',
          },
        },
        required: ['product_id', 'id', 'input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($product_id: uuid!, $id: uuid!, $input: members_set_input!) {
            update_members_by_pk(pk_columns: {product_id: $product_id, id: $id}, _set: $input) {
              id product_id email name color created_at
            }
          }`,
          variables: { product_id: args.product_id, id: args.id, input: args.input },
        })
      },
    },

    // ── Uye Sil ──
    {
      name: 'crm_members_delete',
      description: 'Bir takim uyesini kalici olarak siler. where filtresi kullanir.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Urun UUID (zorunlu)' },
          id: { type: 'string', description: 'Uye UUID (zorunlu)' },
        },
        required: ['product_id', 'id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($product_id: uuid!, $id: uuid!) {
            delete_members(where: {product_id: {_eq: $product_id}, id: {_eq: $id}}) {
              affected_rows
            }
          }`,
          variables: { product_id: args.product_id, id: args.id },
        })
      },
    },

    // ══════════════════════════════════════════
    //  ROLLER (Roles)
    // ══════════════════════════════════════════

    // ── Rolleri Listele ──
    {
      name: 'crm_roles_list',
      description: 'Belirli bir urune ait tum rolleri listeler.',
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
            roles(where: {product_id: {_eq: $product_id}}) {
              id product_id name description created_at
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── Rolleri Izinlerle Listele ──
    {
      name: 'crm_roles_list_with_permissions',
      description: 'Rolleri modul izinleriyle birlikte listeler.',
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
            roles(where: {product_id: {_eq: $product_id}}) {
              id product_id name description created_at
              role_module_permissions {
                id module_id can_read can_write can_update can_delete
              }
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── Rol Olustur ──
    {
      name: 'crm_roles_create',
      description: 'Yeni bir rol olusturur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'roles_insert_input nesnesi (product_id, name, description)',
          },
        },
        required: ['input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: roles_insert_input!) {
            insert_roles_one(object: $input) {
              id product_id name description created_at
            }
          }`,
          variables: { input: args.input },
        })
      },
    },

    // ── Rol Guncelle ──
    {
      name: 'crm_roles_update',
      description: 'Bir rolu gunceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Rol UUID (zorunlu)' },
          input: {
            type: 'object',
            description: 'roles_set_input nesnesi (name, description)',
          },
        },
        required: ['id', 'input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $input: roles_set_input!) {
            update_roles_by_pk(pk_columns: {id: $id}, _set: $input) {
              id product_id name description created_at
            }
          }`,
          variables: { id: args.id, input: args.input },
        })
      },
    },

    // ── Rol Sil ──
    {
      name: 'crm_roles_delete',
      description: 'Bir rolu kalici olarak siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Rol UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_roles_by_pk(id: $id) {
              id
            }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── Uyeye Rol Ata ──
    {
      name: 'crm_roles_assign',
      description: 'Bir takim uyesine rol atar.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'member_roles_insert_input nesnesi (product_id, member_id, role_id)',
          },
        },
        required: ['input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: member_roles_insert_input!) {
            insert_member_roles_one(object: $input) {
              id product_id member_id role_id
            }
          }`,
          variables: { input: args.input },
        })
      },
    },

    // ── Uyeden Rol Kaldir ──
    {
      name: 'crm_roles_remove',
      description: 'Bir takim uyesinden rolu kaldirir. where filtresi: product_id, member_id, role_id.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Urun UUID (zorunlu)' },
          member_id: { type: 'string', description: 'Uye UUID (zorunlu)' },
          role_id: { type: 'string', description: 'Rol UUID (zorunlu)' },
        },
        required: ['product_id', 'member_id', 'role_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($product_id: uuid!, $member_id: uuid!, $role_id: uuid!) {
            delete_member_roles(where: {
              product_id: {_eq: $product_id},
              member_id: {_eq: $member_id},
              role_id: {_eq: $role_id}
            }) {
              affected_rows
            }
          }`,
          variables: { product_id: args.product_id, member_id: args.member_id, role_id: args.role_id },
        })
      },
    },

    // ── Rol Izni Ayarla (Upsert) ──
    {
      name: 'crm_roles_set_permission',
      description: 'Bir rol icin modul izinlerini ayarlar. Varsa gunceller, yoksa olusturur (upsert).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'role_module_permissions_insert_input nesnesi (role_id, module_id, can_read, can_write, can_update, can_delete)',
          },
        },
        required: ['input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: role_module_permissions_insert_input!) {
            insert_role_module_permissions_one(
              object: $input,
              on_conflict: {
                constraint: role_module_permissions_role_id_module_id_key,
                update_columns: [can_read, can_write, can_update, can_delete]
              }
            ) {
              id role_id module_id can_read can_write can_update can_delete
            }
          }`,
          variables: { input: args.input },
        })
      },
    },

    // ══════════════════════════════════════════
    //  AFFILIATE'LER
    // ══════════════════════════════════════════

    // ── Affiliate'leri Listele ──
    {
      name: 'crm_affiliates_list',
      description: 'Affiliate ortaklarini komisyon istatistikleriyle birlikte listeler.',
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
            affiliates(where: {product_id: {_eq: $product_id}}) {
              id product_id name email phone country_code commission_rate status notes report_token created_at
              affiliate_commissions {
                id commission_amount commission_rate status payment_date notes created_at updated_at
                lead_id payment_id
              }
              affiliate_commissions_aggregate {
                aggregate {
                  count
                  sum { commission_amount }
                }
              }
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── Affiliate Olustur ──
    {
      name: 'crm_affiliates_create',
      description: 'Yeni bir affiliate ortagi olusturur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'affiliates_insert_input nesnesi (product_id, name, email, phone, country_code, commission_rate, status, notes)',
          },
        },
        required: ['input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: affiliates_insert_input!) {
            insert_affiliates_one(object: $input) {
              id product_id name email phone country_code commission_rate status notes report_token created_at
            }
          }`,
          variables: { input: args.input },
        })
      },
    },

    // ── Affiliate Guncelle ──
    {
      name: 'crm_affiliates_update',
      description: 'Bir affiliate ortaginini bilgilerini gunceller.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Affiliate UUID (zorunlu)' },
          input: {
            type: 'object',
            description: 'affiliates_set_input nesnesi (name, email, phone, country_code, commission_rate, status, notes)',
          },
        },
        required: ['id', 'input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $input: affiliates_set_input!) {
            update_affiliates_by_pk(pk_columns: {id: $id}, _set: $input) {
              id product_id name email phone country_code commission_rate status notes report_token created_at
            }
          }`,
          variables: { id: args.id, input: args.input },
        })
      },
    },

    // ── Affiliate Sil ──
    {
      name: 'crm_affiliates_delete',
      description: 'Bir affiliate ortaginini kalici olarak siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Affiliate UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_affiliates_by_pk(id: $id) {
              id
            }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ══════════════════════════════════════════
    //  KOMISYONLAR (Commissions)
    // ══════════════════════════════════════════

    // ── Komisyonlari Listele ──
    {
      name: 'crm_commissions_list',
      description: 'Affiliate komisyonlarini affiliate, lead ve odeme iliskileriyle listeler.',
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
            affiliate_commissions(where: {product_id: {_eq: $product_id}}, order_by: {created_at: desc}) {
              id product_id affiliate_id lead_id payment_id
              commission_amount commission_rate status payment_date notes created_at updated_at
              affiliate { id name email phone commission_rate status }
              lead { id name phone email sell_status }
              payment { id name total_amount }
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },

    // ── Komisyon Olustur ──
    {
      name: 'crm_commissions_create',
      description: 'Yeni bir affiliate komisyon kaydi olusturur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'affiliate_commissions_insert_input nesnesi (product_id, affiliate_id, commission_amount, commission_rate, lead_id, payment_id, status, notes)',
          },
        },
        required: ['input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($input: affiliate_commissions_insert_input!) {
            insert_affiliate_commissions_one(object: $input) {
              id product_id affiliate_id lead_id payment_id
              commission_amount commission_rate status payment_date notes created_at updated_at
            }
          }`,
          variables: { input: args.input },
        })
      },
    },

    // ── Komisyon Guncelle ──
    {
      name: 'crm_commissions_update',
      description: 'Bir komisyon kaydini gunceller (durum, tutar, not vb.).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Komisyon UUID (zorunlu)' },
          input: {
            type: 'object',
            description: 'affiliate_commissions_set_input nesnesi (status, commission_amount, commission_rate, notes, payment_date)',
          },
        },
        required: ['id', 'input'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!, $input: affiliate_commissions_set_input!) {
            update_affiliate_commissions_by_pk(pk_columns: {id: $id}, _set: $input) {
              id product_id affiliate_id commission_amount commission_rate status payment_date notes updated_at
            }
          }`,
          variables: { id: args.id, input: args.input },
        })
      },
    },

    // ── Komisyon Sil ──
    {
      name: 'crm_commissions_delete',
      description: 'Bir komisyon kaydini kalici olarak siler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Komisyon UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        return hasura.query({
          query: `mutation($id: uuid!) {
            delete_affiliate_commissions_by_pk(id: $id) {
              id
            }
          }`,
          variables: { id: args.id },
        })
      },
    },

    // ── Affiliate Dashboard Istatistikleri ──
    {
      name: 'crm_affiliate_dashboard_stats',
      description: 'Affiliate paneli icin ozet istatistikler: toplam/aktif affiliate, odenmis/bekleyen/kismi/tamamlanmis komisyonlar.',
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
            total_affiliates: affiliates_aggregate(where: {product_id: {_eq: $product_id}}) {
              aggregate { count }
            }
            active_affiliates: affiliates_aggregate(where: {product_id: {_eq: $product_id}, status: {_eq: "ACTIVE"}}) {
              aggregate { count }
            }
            paid_commissions: affiliate_commissions_aggregate(where: {product_id: {_eq: $product_id}, status: {_eq: "PAID"}}) {
              aggregate { count sum { commission_amount } }
            }
            pending_commissions: affiliate_commissions_aggregate(where: {product_id: {_eq: $product_id}, status: {_eq: "PENDING"}}) {
              aggregate { count sum { commission_amount } }
            }
            partial_commissions: affiliate_commissions_aggregate(where: {product_id: {_eq: $product_id}, status: {_eq: "PARTIAL"}}) {
              aggregate { count sum { commission_amount } }
            }
            completed_commissions: affiliate_commissions_aggregate(where: {product_id: {_eq: $product_id}, status: {_eq: "COMPLETED"}}) {
              aggregate { count sum { commission_amount } }
            }
          }`,
          variables: { product_id: args.product_id },
        })
      },
    },
  ]
}
