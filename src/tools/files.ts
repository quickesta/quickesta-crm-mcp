/**
 * Dosya yöneticisi, yükleme linkleri, lead belgeleri, kayıp nedenleri,
 * form konfigürasyonları, dashboard istatistikleri, satış performansı ve destek talepleri.
 *
 * Tüm sorgular $variable sözdizimi kullanır — string interpolasyon yok.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'
import { getDateRanges } from '../utils.js'

// ── Field fragments ──

const FILE_FIELDS = `id product_id name original_name file_path s3_key file_url file_type mime_type file_size folder_path category tags alt_text description is_public download_count created_by created_at updated_at`

const UPLOAD_LINK_FIELDS = `id product_id token label description target_folder max_files max_file_size_mb allowed_file_types expires_at is_active upload_count created_by created_at updated_at`

const FORM_CONFIG_FIELDS = `id product_id form_type form_slug logo_file_id primary_color is_active form_title form_description success_message created_at updated_at
  form_field_mappings(order_by: {field_order: asc}) { id form_config_id field_key field_label field_type ui_type is_required field_order help_text default_value validation_rules section_name col_span target_type target_field extended_module_id created_at updated_at }
  document_categories(order_by: {sort_order: asc}) { id form_config_id product_id name description is_required sort_order allowed_types max_file_size_mb created_at }`

const FIELD_MAPPING_FIELDS = `id form_config_id field_key field_label field_type ui_type is_required field_order help_text default_value validation_rules section_name col_span target_type target_field extended_module_id created_at updated_at`

const DOC_CATEGORY_FIELDS = `id form_config_id product_id name description is_required sort_order allowed_types max_file_size_mb created_at`

const LEAD_DOC_FIELDS = `id lead_id lead_document_link_id document_category_id product_id file_name original_name file_path file_url file_type mime_type file_size uploader_name uploader_note uploaded_at
  document_category { id name is_required sort_order }`

const TICKET_FIELDS = `id ticket_number title category priority status source_platform created_at updated_at`

const TICKET_DETAIL_FIELDS = `id ticket_number organization_id product_id reporter_id reporter_name reporter_email title description category priority status source_platform created_at updated_at resolved_at closed_at
  product { id name product_type { code name } }
  ticket_messages(where: {is_internal: {_eq: false}}, order_by: {created_at: asc}) {
    id ticket_id sender_id sender_name sender_email content is_internal message_type created_at
    ticket_attachments { id file_name original_name file_path s3_key file_url file_type mime_type file_size uploaded_by uploaded_by_name created_at }
  }
  ticket_attachments(where: {message_id: {_is_null: true}}, order_by: {created_at: asc}) {
    id file_name original_name file_path s3_key file_url file_type mime_type file_size uploaded_by uploaded_by_name created_at
  }`

const TICKET_MSG_FIELDS = `id ticket_id sender_id sender_name sender_email content is_internal message_type created_at`

const TICKET_ATTACH_FIELDS = `id ticket_id message_id file_name original_name file_path s3_key file_url file_type mime_type file_size uploaded_by uploaded_by_name created_at`

export function createFileAndMiscTools(hasura: HasuraClient): ToolDefinition[] {
  return [

    // ═══════════════════════════════════════════════
    //  DASHBOARD
    // ═══════════════════════════════════════════════

    {
      name: 'crm_dashboard_stats',
      description: 'Dashboard genel istatistikleri — üye, lead, ödeme, modül sayıları.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { monthStart } = getDateRanges()
        return hasura.query({
          query: `query($product_id: uuid!, $current_month_start: timestamp!) {
            members_aggregate(where: {product_id: {_eq: $product_id}}) { aggregate { count } }
            leads_aggregate(where: {product_id: {_eq: $product_id}, sell_status: {_in: ["NEW_LEAD", "HIGH_POTENTIAL", "CALL_AGAIN"]}}) { aggregate { count } }
            payments_aggregate(where: {product_id: {_eq: $product_id}, created_at: {_gte: $current_month_start}, payment_details: {status: {_eq: "PAID"}}}) { aggregate { count sum { total_amount } } }
            modules_aggregate(where: {product_id: {_eq: $product_id}}) { aggregate { count } }
          }`,
          variables: { product_id: args.product_id, current_month_start: monthStart },
        })
      },
    },

    {
      name: 'crm_dashboard_followup_stats',
      description: 'Takip istatistikleri — bugün, yarın, gecikmiş, bu hafta.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { today, tomorrow, weekEnd } = getDateRanges()
        return hasura.query({
          query: `query($product_id: uuid!, $today_start: date!, $tomorrow_start: date!, $week_end: date!) {
            today_followups: leads_needing_followup_aggregate(where: {product_id: {_eq: $product_id}, followup_date: {_eq: $today_start}}) { aggregate { count } }
            tomorrow_followups: leads_needing_followup_aggregate(where: {product_id: {_eq: $product_id}, followup_date: {_eq: $tomorrow_start}}) { aggregate { count } }
            overdue_followups: leads_needing_followup_aggregate(where: {product_id: {_eq: $product_id}, followup_date: {_lt: $today_start}}) { aggregate { count } }
            this_week_followups: leads_needing_followup_aggregate(where: {product_id: {_eq: $product_id}, followup_date: {_gte: $today_start, _lte: $week_end}}) { aggregate { count } }
          }`,
          variables: { product_id: args.product_id, today_start: today, tomorrow_start: tomorrow, week_end: weekEnd },
        })
      },
    },

    {
      name: 'crm_dashboard_recent_leads',
      description: 'Son eklenen leadler (varsayılan 5).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          limit: { type: 'number', description: 'Maks sonuç (varsayılan: 5)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!, $limit: Int = 5) {
          leads(where: {product_id: {_eq: $product_id}, is_deleted: {_eq: false}}, order_by: {created_at: desc}, limit: $limit) {
            id name phone email source sell_status created_at
          }
        }`,
        variables: { product_id: args.product_id, limit: args.limit ?? 5 },
      }),
    },

    {
      name: 'crm_dashboard_recent_payments',
      description: 'Son ödemeler (varsayılan 5).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          limit: { type: 'number', description: 'Maks sonuç (varsayılan: 5)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!, $limit: Int = 5) {
          payments(where: {product_id: {_eq: $product_id}}, order_by: {created_at: desc}, limit: $limit) {
            id name total_amount created_at
            payment_details { id paid_amount status }
            payment_discounts { id discount_type discount_value discount_reason }
          }
        }`,
        variables: { product_id: args.product_id, limit: args.limit ?? 5 },
      }),
    },

    {
      name: 'crm_dashboard_summary',
      description: 'Dashboard özet — bu ay yeni/başarılı leadler, bekleyen ödemeler, takip edilecekler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { monthStart, weekEnd } = getDateRanges()
        return hasura.query({
          query: `query($product_id: uuid!, $current_month_start: timestamp!, $current_week_end: date!) {
            new_leads_this_month: leads_aggregate(where: {product_id: {_eq: $product_id}, created_at: {_gte: $current_month_start}}) { aggregate { count } }
            successful_leads_this_month: leads_aggregate(where: {product_id: {_eq: $product_id}, sell_status: {_eq: "SUCCESS_LEAD"}, created_at: {_gte: $current_month_start}, is_deleted: {_eq: false}}) { aggregate { count } }
            pending_payments: payment_details_aggregate(where: {payment: {product_id: {_eq: $product_id}}, status: {_nin: ["PAID", "CANCELLED"]}}) { aggregate { count sum { amount } } }
            leads_to_follow: calls_aggregate(where: {product_id: {_eq: $product_id}, follow_up_date: {_gte: "now()", _lte: $current_week_end}, lead: {sell_status: {_nin: ["SUCCESS_LEAD", "REJECTED"]}}}) { aggregate { count } }
            high_potential_this_month: leads_aggregate(where: {product_id: {_eq: $product_id}, sell_status: {_eq: "HIGH_POTENTIAL"}, created_at: {_gte: $current_month_start}, is_deleted: {_eq: false}}) { aggregate { count } }
          }`,
          variables: { product_id: args.product_id, current_month_start: monthStart, current_week_end: weekEnd },
        })
      },
    },

    {
      name: 'crm_dashboard_payment_stats',
      description: 'Tahsilat istatistikleri — bugün/yarın/gecikmiş/bu hafta vadeli ödemeler.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { today, tomorrow, weekEnd, monthStart } = getDateRanges()
        return hasura.query({
          query: `query($product_id: uuid!, $today: date!, $tomorrow: date!, $week_end: date!, $month_start: date!) {
            today_payments_due: payment_details_aggregate(where: {payment: {product_id: {_eq: $product_id}}, due_date: {_eq: $today}, status: {_nin: ["PAID", "CANCELLED"]}}) { aggregate { count sum { amount } } }
            tomorrow_payments_due: payment_details_aggregate(where: {payment: {product_id: {_eq: $product_id}}, due_date: {_eq: $tomorrow}, status: {_nin: ["PAID", "CANCELLED"]}}) { aggregate { count sum { amount } } }
            overdue_payments: payment_details_aggregate(where: {payment: {product_id: {_eq: $product_id}}, due_date: {_lt: $today}, status: {_nin: ["PAID", "CANCELLED"]}}) { aggregate { count sum { amount } } }
            this_week_payments_due: payment_details_aggregate(where: {payment: {product_id: {_eq: $product_id}}, due_date: {_gte: $today, _lte: $week_end}, status: {_nin: ["PAID", "CANCELLED"]}}) { aggregate { count sum { amount } } }
            this_month_collected: payment_details_aggregate(where: {payment: {product_id: {_eq: $product_id}}, payment_date: {_gte: $month_start}, status: {_eq: "PAID"}}) { aggregate { count sum { paid_amount } } }
          }`,
          variables: { product_id: args.product_id, today, tomorrow, week_end: weekEnd, month_start: monthStart },
        })
      },
    },

    // ═══════════════════════════════════════════════
    //  SALES PERFORMANCE
    // ═══════════════════════════════════════════════

    {
      name: 'crm_sales_speed_to_lead',
      description: 'Hız analizi — lead oluşturma ile ilk arama arasındaki süre.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          start_date: { type: 'string', description: 'Başlangıç tarihi (ISO timestamp)' },
          end_date: { type: 'string', description: 'Bitiş tarihi (ISO timestamp)' },
          member_id: { type: 'string', description: 'Üye filtresi' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!, $start_date: timestamp, $end_date: timestamp, $member_id: uuid) {
          leads(
            where: {
              product_id: {_eq: $product_id}
              created_at: {_gte: $start_date, _lte: $end_date}
              calls: {_is_null: false}
            }
            order_by: {created_at: desc}
          ) {
            id name created_at assigned_member_id
            assigned_member: members { id name }
            calls(order_by: {created_at: asc}, limit: 1) { id created_at called_by }
          }
        }`,
        variables: {
          product_id: args.product_id,
          start_date: args.start_date ?? null,
          end_date: args.end_date ?? null,
          member_id: args.member_id ?? null,
        },
      }),
    },

    {
      name: 'crm_sales_conversion_rate',
      description: 'Dönüşüm oranı — aranmış leadlerin başarı durumu.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          start_date: { type: 'string', description: 'Başlangıç tarihi' },
          end_date: { type: 'string', description: 'Bitiş tarihi' },
          member_id: { type: 'string', description: 'Üye filtresi' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!, $start_date: timestamp, $end_date: timestamp, $member_id: uuid) {
          leads(
            where: {
              product_id: {_eq: $product_id}
              created_at: {_gte: $start_date, _lte: $end_date}
              calls: {_is_null: false}
            }
          ) {
            id name sell_status assigned_member_id
            assigned_member: members { id name }
            calls_aggregate { aggregate { count } }
          }
        }`,
        variables: {
          product_id: args.product_id,
          start_date: args.start_date ?? null,
          end_date: args.end_date ?? null,
          member_id: args.member_id ?? null,
        },
      }),
    },

    {
      name: 'crm_sales_followup_counts',
      description: 'Takip adet dağılımı — lead başına arama sayıları.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          start_date: { type: 'string', description: 'Başlangıç tarihi' },
          end_date: { type: 'string', description: 'Bitiş tarihi' },
          member_id: { type: 'string', description: 'Üye filtresi' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!, $start_date: timestamp, $end_date: timestamp, $member_id: uuid) {
          leads(
            where: {
              product_id: {_eq: $product_id}
              created_at: {_gte: $start_date, _lte: $end_date}
            }
          ) {
            id name assigned_member_id
            assigned_member: members { id name }
            calls(order_by: {created_at: desc}) { id created_at }
            calls_aggregate { aggregate { count } }
          }
        }`,
        variables: {
          product_id: args.product_id,
          start_date: args.start_date ?? null,
          end_date: args.end_date ?? null,
          member_id: args.member_id ?? null,
        },
      }),
    },

    {
      name: 'crm_sales_lost_reason_ratios',
      description: 'Kayıp neden dağılımı — red edilen leadlerin neden analizi.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          start_date: { type: 'string', description: 'Başlangıç tarihi' },
          end_date: { type: 'string', description: 'Bitiş tarihi' },
          member_id: { type: 'string', description: 'Üye filtresi' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!, $start_date: timestamp, $end_date: timestamp, $member_id: uuid) {
          leads(
            where: {
              product_id: {_eq: $product_id}
              created_at: {_gte: $start_date, _lte: $end_date}
              sell_status: {_eq: "REJECTED"}
              rejection_reason: {_is_null: false}
            }
          ) {
            id assigned_member_id rejection_reason
            assigned_member: members { id name }
            lost_reason: lost_reasons { id name }
          }
        }`,
        variables: {
          product_id: args.product_id,
          start_date: args.start_date ?? null,
          end_date: args.end_date ?? null,
          member_id: args.member_id ?? null,
        },
      }),
    },

    {
      name: 'crm_sales_call_notes_stats',
      description: 'Arama notları istatistikleri — kelime sayıları, üye bazlı.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          start_date: { type: 'string', description: 'Başlangıç tarihi' },
          end_date: { type: 'string', description: 'Bitiş tarihi' },
          member_id: { type: 'string', description: 'Üye filtresi' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!, $start_date: timestamp, $end_date: timestamp, $member_id: uuid) {
          calls(
            where: {
              product_id: {_eq: $product_id}
              created_at: {_gte: $start_date, _lte: $end_date}
            }
            order_by: {created_at: desc}
          ) {
            id call_notes called_by created_at
            called_by_member: members { id name }
          }
        }`,
        variables: {
          product_id: args.product_id,
          start_date: args.start_date ?? null,
          end_date: args.end_date ?? null,
          member_id: args.member_id ?? null,
        },
      }),
    },

    // ═══════════════════════════════════════════════
    //  FILE MANAGER
    // ═══════════════════════════════════════════════

    {
      name: 'crm_files_list',
      description: 'Klasördeki dosyaları listele.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          folder_path: { type: 'string', description: 'Klasör yolu (varsayılan: /)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!, $folder_path: String) {
          file_manager(
            where: {product_id: {_eq: $product_id}, folder_path: {_eq: $folder_path}, is_folder: {_eq: false}}
            order_by: [{sort_order: asc}, {created_at: desc}]
          ) { ${FILE_FIELDS} }
        }`,
        variables: { product_id: args.product_id, folder_path: args.folder_path ?? '/' },
      }),
    },

    {
      name: 'crm_files_folders',
      description: 'Klasörleri listele.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          parent_path: { type: 'string', description: 'Üst klasör yolu (varsayılan: /)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!, $parent_path: String) {
          file_manager(
            where: {product_id: {_eq: $product_id}, folder_path: {_eq: $parent_path}, is_folder: {_eq: true}}
            order_by: {name: asc}
          ) { id product_id name folder_path created_at }
        }`,
        variables: { product_id: args.product_id, parent_path: args.parent_path ?? '/' },
      }),
    },

    {
      name: 'crm_files_get',
      description: 'Tek dosya detayı.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Dosya UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($id: uuid!) {
          file_manager_by_pk(id: $id) { ${FILE_FIELDS} }
        }`,
        variables: { id: args.id },
      }),
    },

    {
      name: 'crm_files_create',
      description: 'Dosya kaydı oluştur (S3 yükleme sonrası).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          name: { type: 'string', description: 'Dosya adı (zorunlu)' },
          original_name: { type: 'string' }, file_path: { type: 'string' },
          s3_key: { type: 'string' }, file_url: { type: 'string' },
          file_type: { type: 'string' }, mime_type: { type: 'string' },
          file_size: { type: 'number' }, folder_path: { type: 'string' },
          category: { type: 'string' }, is_public: { type: 'boolean' },
          created_by: { type: 'string' },
        },
        required: ['product_id', 'name'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: file_manager_insert_input!) {
          insert_file_manager_one(object: $input) {
            id product_id name original_name file_path s3_key file_url file_type mime_type file_size folder_path created_by created_at
          }
        }`,
        variables: { input: args },
      }),
    },

    {
      name: 'crm_files_create_folder',
      description: 'Yeni klasör oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          name: { type: 'string', description: 'Klasör adı (zorunlu)' },
          folder_path: { type: 'string', description: 'Üst klasör yolu (zorunlu)' },
        },
        required: ['product_id', 'name', 'folder_path'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: file_manager_insert_input!) {
          insert_file_manager_one(object: $input) { id product_id name folder_path is_folder created_at }
        }`,
        variables: { input: { ...args, is_folder: true } },
      }),
    },

    {
      name: 'crm_files_update',
      description: 'Dosya meta bilgilerini güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Dosya UUID (zorunlu)' },
          name: { type: 'string' }, alt_text: { type: 'string' },
          description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
          category: { type: 'string' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: file_manager_set_input!) {
            update_file_manager_by_pk(pk_columns: {id: $id}, _set: $input) { id name alt_text description tags category updated_at }
          }`,
          variables: { id, input },
        })
      },
    },

    {
      name: 'crm_files_delete',
      description: 'Dosya veya klasör sil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Dosya UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($id: uuid!, $product_id: uuid!) {
          delete_file_manager(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}) { affected_rows }
        }`,
        variables: { id: args.id, product_id: args.product_id },
      }),
    },

    // ═══════════════════════════════════════════════
    //  FILE UPLOAD LINKS
    // ═══════════════════════════════════════════════

    {
      name: 'crm_upload_links_list',
      description: 'Dosya yükleme linklerini listele (müşterilerle paylaşılabilir).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!) {
          file_upload_links(where: {product_id: {_eq: $product_id}}, order_by: {created_at: desc}) { ${UPLOAD_LINK_FIELDS} }
        }`,
        variables: { product_id: args.product_id },
      }),
    },

    {
      name: 'crm_upload_links_create',
      description: 'Paylaşılabilir dosya yükleme linki oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          label: { type: 'string' }, description: { type: 'string' },
          target_folder: { type: 'string' }, max_files: { type: 'number' },
          max_file_size_mb: { type: 'number' },
          allowed_file_types: { type: 'array', items: { type: 'string' } },
          expires_at: { type: 'string' }, created_by: { type: 'string' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: file_upload_links_insert_input!) {
          insert_file_upload_links_one(object: $input) { ${UPLOAD_LINK_FIELDS} }
        }`,
        variables: { input: args },
      }),
    },

    {
      name: 'crm_upload_links_update',
      description: 'Dosya yükleme linkini güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Link UUID (zorunlu)' },
          label: { type: 'string' }, description: { type: 'string' },
          target_folder: { type: 'string' }, max_files: { type: 'number' },
          max_file_size_mb: { type: 'number' },
          allowed_file_types: { type: 'array', items: { type: 'string' } },
          expires_at: { type: 'string' }, is_active: { type: 'boolean' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: file_upload_links_set_input!) {
            update_file_upload_links_by_pk(pk_columns: {id: $id}, _set: $input) { id is_active updated_at }
          }`,
          variables: { id, input },
        })
      },
    },

    {
      name: 'crm_upload_links_delete',
      description: 'Dosya yükleme linkini sil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Link UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($id: uuid!) {
          delete_file_upload_links_by_pk(id: $id) { id }
        }`,
        variables: { id: args.id },
      }),
    },

    // ═══════════════════════════════════════════════
    //  LEAD DOCUMENTS
    // ═══════════════════════════════════════════════

    {
      name: 'crm_lead_documents_list',
      description: 'Lead\'e bağlı belgeleri listele.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
        },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($lead_id: uuid!) {
          lead_documents(where: {lead_id: {_eq: $lead_id}}, order_by: {uploaded_at: desc}) { ${LEAD_DOC_FIELDS} }
        }`,
        variables: { lead_id: args.lead_id },
      }),
    },

    {
      name: 'crm_lead_documents_create',
      description: 'Lead\'e belge ekle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
          document_category_id: { type: 'string' }, product_id: { type: 'string' },
          lead_document_link_id: { type: 'string' },
          file_name: { type: 'string', description: 'Dosya adı (zorunlu)' },
          original_name: { type: 'string' }, file_path: { type: 'string' },
          file_url: { type: 'string' }, file_type: { type: 'string' },
          mime_type: { type: 'string' }, file_size: { type: 'number' },
          uploader_name: { type: 'string' }, uploader_note: { type: 'string' },
        },
        required: ['lead_id', 'file_name'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: lead_documents_insert_input!) {
          insert_lead_documents_one(object: $input) {
            id lead_id document_category_id file_name original_name file_path file_url file_type uploaded_at
          }
        }`,
        variables: { input: args },
      }),
    },

    {
      name: 'crm_lead_documents_delete',
      description: 'Lead belgesini sil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Belge UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($id: uuid!) { delete_lead_documents_by_pk(id: $id) { id } }`,
        variables: { id: args.id },
      }),
    },

    {
      name: 'crm_lead_document_links_get',
      description: 'Lead için belge yükleme linkini getir (form config ve kategoriler dahil).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
        },
        required: ['lead_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($lead_id: uuid!) {
          lead_document_links(where: {lead_id: {_eq: $lead_id}}, order_by: {created_at: desc}, limit: 1) {
            id lead_id form_config_id product_id token is_active created_at
            form_config {
              id form_title form_slug
              document_categories(order_by: {sort_order: asc}) { id name description is_required sort_order max_file_size_mb }
            }
          }
        }`,
        variables: { lead_id: args.lead_id },
      }),
    },

    {
      name: 'crm_lead_document_links_create',
      description: 'Lead için belge yükleme linki oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID (zorunlu)' },
          form_config_id: { type: 'string', description: 'Form config UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['lead_id', 'form_config_id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: lead_document_links_insert_input!) {
          insert_lead_document_links_one(object: $input) { id lead_id form_config_id product_id token is_active created_at }
        }`,
        variables: { input: args },
      }),
    },

    // ═══════════════════════════════════════════════
    //  DOCUMENT CATEGORIES
    // ═══════════════════════════════════════════════

    {
      name: 'crm_document_categories_list',
      description: 'Belge kategorilerini listele (form config bazlı).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          form_config_id: { type: 'string', description: 'Form Config UUID (zorunlu)' },
        },
        required: ['form_config_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($form_config_id: uuid!) {
          document_categories(where: {form_config_id: {_eq: $form_config_id}}, order_by: {sort_order: asc}) { ${DOC_CATEGORY_FIELDS} }
        }`,
        variables: { form_config_id: args.form_config_id },
      }),
    },

    {
      name: 'crm_document_categories_create',
      description: 'Belge kategorisi oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          form_config_id: { type: 'string', description: 'Form Config UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          name: { type: 'string', description: 'Kategori adı (zorunlu)' },
          description: { type: 'string' }, is_required: { type: 'boolean' },
          sort_order: { type: 'number' },
          allowed_types: { type: 'array', items: { type: 'string' } },
          max_file_size_mb: { type: 'number' },
        },
        required: ['form_config_id', 'product_id', 'name'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: document_categories_insert_input!) {
          insert_document_categories_one(object: $input) { ${DOC_CATEGORY_FIELDS} }
        }`,
        variables: { input: args },
      }),
    },

    {
      name: 'crm_document_categories_update',
      description: 'Belge kategorisini güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kategori UUID (zorunlu)' },
          name: { type: 'string' }, description: { type: 'string' },
          is_required: { type: 'boolean' }, sort_order: { type: 'number' },
          allowed_types: { type: 'array', items: { type: 'string' } },
          max_file_size_mb: { type: 'number' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: document_categories_set_input!) {
            update_document_categories_by_pk(pk_columns: {id: $id}, _set: $input) { id name description is_required sort_order allowed_types max_file_size_mb }
          }`,
          variables: { id, input },
        })
      },
    },

    {
      name: 'crm_document_categories_delete',
      description: 'Belge kategorisini sil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Kategori UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($id: uuid!) { delete_document_categories_by_pk(id: $id) { id } }`,
        variables: { id: args.id },
      }),
    },

    // ═══════════════════════════════════════════════
    //  LOST REASONS
    // ═══════════════════════════════════════════════

    {
      name: 'crm_lost_reasons_list',
      description: 'Kayıp/red nedenlerini listele.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!) {
          lost_reasons(where: {product_id: {_eq: $product_id}}, order_by: [{display_order: asc}, {name: asc}]) { id product_id name display_order created_at updated_at }
          lost_reasons_aggregate(where: {product_id: {_eq: $product_id}}) { aggregate { count } }
        }`,
        variables: { product_id: args.product_id },
      }),
    },

    {
      name: 'crm_lost_reasons_get',
      description: 'Tek kayıp nedeni detayı.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Neden UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($id: uuid!, $product_id: uuid!) {
          lost_reasons(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}, limit: 1) { id product_id name display_order created_at updated_at }
        }`,
        variables: { id: args.id, product_id: args.product_id },
      }),
    },

    {
      name: 'crm_lost_reasons_create',
      description: 'Kayıp/red nedeni oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          name: { type: 'string', description: 'Neden adı (zorunlu)' },
          display_order: { type: 'number' },
        },
        required: ['product_id', 'name'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: lost_reasons_insert_input!) {
          insert_lost_reasons_one(object: $input) { id product_id name display_order created_at updated_at }
        }`,
        variables: { input: args },
      }),
    },

    {
      name: 'crm_lost_reasons_update',
      description: 'Kayıp nedenini güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Neden UUID (zorunlu)' },
          name: { type: 'string' },
          display_order: { type: 'number' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: lost_reasons_set_input!) {
            update_lost_reasons_by_pk(pk_columns: {id: $id}, _set: $input) { id product_id name display_order created_at updated_at }
          }`,
          variables: { id, input },
        })
      },
    },

    {
      name: 'crm_lost_reasons_delete',
      description: 'Kayıp nedenini sil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Neden UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($id: uuid!) { delete_lost_reasons_by_pk(id: $id) { id } }`,
        variables: { id: args.id },
      }),
    },

    {
      name: 'crm_lost_reasons_reorder',
      description: 'Kayıp nedenlerini toplu sırala.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          updates: {
            type: 'array',
            description: 'Sıralama listesi: [{where: {id: {_eq: "..."}}, _set: {display_order: N}}]',
            items: { type: 'object' },
          },
        },
        required: ['updates'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($updates: [lost_reasons_updates!]!) {
          update_lost_reasons_many(updates: $updates) { id display_order }
        }`,
        variables: { updates: args.updates },
      }),
    },

    // ═══════════════════════════════════════════════
    //  FORM CONFIGS
    // ═══════════════════════════════════════════════

    {
      name: 'crm_form_configs_list',
      description: 'Form konfigürasyonlarını listele (alan eşlemeleri ve belge kategorileri dahil).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($product_id: uuid!) {
          form_configs(where: {product_id: {_eq: $product_id}}, order_by: {created_at: desc}) { ${FORM_CONFIG_FIELDS} }
        }`,
        variables: { product_id: args.product_id },
      }),
    },

    {
      name: 'crm_form_configs_get',
      description: 'Tek form konfigürasyon detayı.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Form Config UUID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
        },
        required: ['id', 'product_id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($id: uuid!, $product_id: uuid!) {
          form_configs(where: {id: {_eq: $id}, product_id: {_eq: $product_id}}, limit: 1) { ${FORM_CONFIG_FIELDS} }
        }`,
        variables: { id: args.id, product_id: args.product_id },
      }),
    },

    {
      name: 'crm_form_configs_create',
      description: 'Form konfigürasyonu oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          form_type: { type: 'string', description: 'Form tipi (zorunlu)' },
          form_slug: { type: 'string' }, form_title: { type: 'string' },
          form_description: { type: 'string' }, success_message: { type: 'string' },
          logo_file_id: { type: 'string' }, primary_color: { type: 'string' },
          is_active: { type: 'boolean' },
        },
        required: ['product_id', 'form_type'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: form_configs_insert_input!) {
          insert_form_configs_one(object: $input) {
            id product_id form_type form_slug logo_file_id primary_color is_active form_title form_description success_message created_at updated_at
          }
        }`,
        variables: { input: args },
      }),
    },

    {
      name: 'crm_form_configs_update',
      description: 'Form konfigürasyonunu güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Form Config UUID (zorunlu)' },
          form_type: { type: 'string' }, form_slug: { type: 'string' },
          form_title: { type: 'string' }, form_description: { type: 'string' },
          success_message: { type: 'string' }, logo_file_id: { type: 'string' },
          primary_color: { type: 'string' }, is_active: { type: 'boolean' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: form_configs_set_input!) {
            update_form_configs_by_pk(pk_columns: {id: $id}, _set: $input) {
              id product_id form_type form_slug logo_file_id primary_color is_active form_title form_description success_message created_at updated_at
            }
          }`,
          variables: { id, input },
        })
      },
    },

    {
      name: 'crm_form_configs_delete',
      description: 'Form konfigürasyonunu sil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Form Config UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($id: uuid!) { delete_form_configs_by_pk(id: $id) { id form_type } }`,
        variables: { id: args.id },
      }),
    },

    {
      name: 'crm_form_field_mappings_create',
      description: 'Form alan eşlemesi oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          form_config_id: { type: 'string', description: 'Form Config UUID (zorunlu)' },
          field_key: { type: 'string', description: 'Alan anahtarı (zorunlu)' },
          field_label: { type: 'string', description: 'Görünen etiket (zorunlu)' },
          field_type: { type: 'string' }, ui_type: { type: 'string' },
          is_required: { type: 'boolean' }, field_order: { type: 'number' },
          help_text: { type: 'string' }, default_value: { type: 'string' },
          validation_rules: { type: 'object' }, section_name: { type: 'string' },
          col_span: { type: 'number' }, target_type: { type: 'string' },
          target_field: { type: 'string' }, extended_module_id: { type: 'string' },
        },
        required: ['form_config_id', 'field_key', 'field_label'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: form_field_mappings_insert_input!) {
          insert_form_field_mappings_one(object: $input) { ${FIELD_MAPPING_FIELDS} }
        }`,
        variables: { input: args },
      }),
    },

    {
      name: 'crm_form_field_mappings_update',
      description: 'Form alan eşlemesini güncelle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Eşleme UUID (zorunlu)' },
          field_key: { type: 'string' }, field_label: { type: 'string' },
          field_type: { type: 'string' }, ui_type: { type: 'string' },
          is_required: { type: 'boolean' }, field_order: { type: 'number' },
          help_text: { type: 'string' }, default_value: { type: 'string' },
          validation_rules: { type: 'object' }, section_name: { type: 'string' },
          col_span: { type: 'number' }, target_type: { type: 'string' },
          target_field: { type: 'string' }, extended_module_id: { type: 'string' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { id, ...input } = args
        return hasura.query({
          query: `mutation($id: uuid!, $input: form_field_mappings_set_input!) {
            update_form_field_mappings_by_pk(pk_columns: {id: $id}, _set: $input) { ${FIELD_MAPPING_FIELDS} }
          }`,
          variables: { id, input },
        })
      },
    },

    {
      name: 'crm_form_field_mappings_delete',
      description: 'Form alan eşlemesini sil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Eşleme UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($id: uuid!) { delete_form_field_mappings_by_pk(id: $id) { id field_key } }`,
        variables: { id: args.id },
      }),
    },

    {
      name: 'crm_form_field_mappings_bulk_create',
      description: 'Toplu form alan eşlemesi oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          objects: {
            type: 'array',
            description: 'Alan eşleme listesi (form_field_mappings_insert_input[])',
            items: { type: 'object' },
          },
        },
        required: ['objects'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($objects: [form_field_mappings_insert_input!]!) {
          insert_form_field_mappings(objects: $objects) {
            returning { ${FIELD_MAPPING_FIELDS} }
          }
        }`,
        variables: { objects: args.objects },
      }),
    },

    // ═══════════════════════════════════════════════
    //  TICKETS
    // ═══════════════════════════════════════════════

    {
      name: 'crm_tickets_list',
      description: 'Destek taleplerini listele (organizasyon bazlı).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          where: { type: 'object', description: 'tickets_bool_exp filtresi (zorunlu)' },
          limit: { type: 'number', description: 'Maks sonuç' },
          offset: { type: 'number', description: 'Sayfalama offset' },
        },
        required: ['where'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($where: tickets_bool_exp!, $limit: Int, $offset: Int) {
          tickets(where: $where, order_by: {updated_at: desc}, limit: $limit, offset: $offset) {
            ${TICKET_FIELDS}
            product { id name product_type { code name } }
            ticket_messages_aggregate(where: {is_internal: {_eq: false}}) { aggregate { count } }
          }
          tickets_aggregate(where: $where) { aggregate { count } }
        }`,
        variables: {
          where: args.where,
          limit: args.limit ?? null,
          offset: args.offset ?? null,
        },
      }),
    },

    {
      name: 'crm_tickets_get',
      description: 'Tek destek talebi detayı — mesajlar ve ekler dahil.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Ticket UUID (zorunlu)' },
        },
        required: ['id'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `query($id: uuid!) {
          tickets_by_pk(id: $id) { ${TICKET_DETAIL_FIELDS} }
        }`,
        variables: { id: args.id },
      }),
    },

    {
      name: 'crm_tickets_create',
      description: 'Yeni destek talebi oluştur.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          organization_id: { type: 'number', description: 'Organizasyon ID (zorunlu)' },
          product_id: { type: 'string', description: 'Ürün ID (zorunlu)' },
          title: { type: 'string', description: 'Başlık (zorunlu)' },
          description: { type: 'string' },
          category: { type: 'string', description: 'Kategori' },
          priority: { type: 'string', description: 'low, medium, high, urgent' },
          reporter_id: { type: 'string' }, reporter_name: { type: 'string' },
          reporter_email: { type: 'string' }, source_platform: { type: 'string' },
        },
        required: ['organization_id', 'product_id', 'title'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: tickets_insert_input!) {
          insert_tickets_one(object: $input) { id ticket_number title status created_at }
        }`,
        variables: { input: args },
      }),
    },

    {
      name: 'crm_tickets_create_message',
      description: 'Destek talebine mesaj ekle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ticket_id: { type: 'string', description: 'Ticket UUID (zorunlu)' },
          content: { type: 'string', description: 'Mesaj içeriği (zorunlu)' },
          sender_id: { type: 'string' }, sender_name: { type: 'string' },
          sender_email: { type: 'string' }, is_internal: { type: 'boolean' },
          message_type: { type: 'string' },
        },
        required: ['ticket_id', 'content'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: ticket_messages_insert_input!) {
          insert_ticket_messages_one(object: $input) { ${TICKET_MSG_FIELDS} }
        }`,
        variables: { input: args },
      }),
    },

    {
      name: 'crm_tickets_create_attachment',
      description: 'Destek talebine dosya ekle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ticket_id: { type: 'string', description: 'Ticket UUID (zorunlu)' },
          message_id: { type: 'string', description: 'Mesaj UUID (opsiyonel — mesaja bağlı değilse boş)' },
          file_name: { type: 'string', description: 'Dosya adı (zorunlu)' },
          original_name: { type: 'string' }, file_path: { type: 'string' },
          s3_key: { type: 'string' }, file_url: { type: 'string' },
          file_type: { type: 'string' }, mime_type: { type: 'string' },
          file_size: { type: 'number' }, uploaded_by: { type: 'string' },
          uploaded_by_name: { type: 'string' },
        },
        required: ['ticket_id', 'file_name'],
      },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: ticket_attachments_insert_input!) {
          insert_ticket_attachments_one(object: $input) { ${TICKET_ATTACH_FIELDS} }
        }`,
        variables: { input: args },
      }),
    },
  ]
}
