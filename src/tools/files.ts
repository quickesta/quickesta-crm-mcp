/**
 * File manager, upload links, lead documents, lost reasons, form configs, dashboard MCP tools.
 */

import type { HasuraClient } from '../hasura-client.js'
import type { ToolDefinition } from '../types.js'
import { sanitize } from '../utils.js'

export function createFileAndMiscTools(hasura: HasuraClient): ToolDefinition[] {
  return [
    // ═══ FILE MANAGER ═══

    { name: 'crm_files_list', description: 'List files in a folder.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' }, folder_path: { type: 'string', description: 'Default: /' } }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `{ file_manager(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}, folder_path: {_eq: "${sanitize((args.folder_path as string) || '/')}"}}, order_by: [{is_folder: desc}, {name: asc}]) { id name original_name file_url file_type mime_type file_size folder_path is_folder is_public category tags alt_text description download_count s3_key created_by created_at } }`,
      }),
    },

    { name: 'crm_files_create', description: 'Create a file record (after upload to S3).',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, name: { type: 'string', description: 'Required' },
        original_name: { type: 'string' }, file_url: { type: 'string' }, s3_key: { type: 'string' },
        file_type: { type: 'string' }, mime_type: { type: 'string' }, file_size: { type: 'number' },
        folder_path: { type: 'string' }, category: { type: 'string' }, is_public: { type: 'boolean' },
        is_folder: { type: 'boolean' }, created_by: { type: 'string' },
      }, required: ['product_id', 'name'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: file_manager_insert_input!) { insert_file_manager_one(object: $input) { id name file_url is_folder created_at } }`,
        variables: { input: args },
      }),
    },

    { name: 'crm_files_delete', description: 'Delete a file or folder.',
      inputSchema: { type: 'object' as const, properties: { file_id: { type: 'string', description: 'Required' }, product_id: { type: 'string', description: 'Required' } }, required: ['file_id', 'product_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { delete_file_manager(where: {id: {_eq: "${sanitize(args.file_id as string)}"}, product_id: {_eq: "${sanitize(args.product_id as string)}"}}) { affected_rows } }`,
      }),
    },

    // ═══ FILE UPLOAD LINKS ═══

    { name: 'crm_upload_links_list', description: 'List file upload links (shareable with customers).',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' } }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `{ file_upload_links(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}}, order_by: {created_at: desc}) { id token title description max_uploads upload_count expires_at is_active folder_path allowed_file_types max_file_size product_id created_at } }`,
      }),
    },

    { name: 'crm_upload_links_create', description: 'Create a shareable file upload link.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, title: { type: 'string' }, description: { type: 'string' },
        max_uploads: { type: 'number' }, expires_at: { type: 'string' }, folder_path: { type: 'string' },
        allowed_file_types: { type: 'array', items: { type: 'string' } }, max_file_size: { type: 'number' },
      }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: file_upload_links_insert_input!) { insert_file_upload_links_one(object: $input) { id token title created_at } }`,
        variables: { input: args },
      }),
    },

    // ═══ LEAD DOCUMENTS ═══

    { name: 'crm_lead_documents_list', description: 'List documents attached to a lead.',
      inputSchema: { type: 'object' as const, properties: { lead_id: { type: 'string', description: 'Required' } }, required: ['lead_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `{ lead_documents(where: {lead_id: {_eq: "${sanitize(args.lead_id as string)}"}}) { id lead_id document_category_id file_manager_id notes created_at document_category { id name } file_manager { id name file_url mime_type file_size } } }`,
      }),
    },

    { name: 'crm_lead_documents_create', description: 'Attach a document to a lead.',
      inputSchema: { type: 'object' as const, properties: {
        lead_id: { type: 'string', description: 'Required' }, file_manager_id: { type: 'string', description: 'Required' },
        document_category_id: { type: 'string' }, notes: { type: 'string' },
      }, required: ['lead_id', 'file_manager_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: lead_documents_insert_input!) { insert_lead_documents_one(object: $input) { id lead_id file_manager_id created_at } }`,
        variables: { input: args },
      }),
    },

    // ═══ LOST REASONS ═══

    { name: 'crm_lost_reasons_list', description: 'List lead rejection/lost reasons.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' } }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `{ lost_reasons(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}}, order_by: {display_order: asc}) { id name display_order created_at updated_at } }`,
      }),
    },

    { name: 'crm_lost_reasons_create', description: 'Create a lost/rejection reason.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' }, name: { type: 'string', description: 'Required' }, display_order: { type: 'number' } }, required: ['product_id', 'name'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: lost_reasons_insert_input!) { insert_lost_reasons_one(object: $input) { id name display_order created_at } }`,
        variables: { input: args },
      }),
    },

    { name: 'crm_lost_reasons_update', description: 'Update a lost reason.',
      inputSchema: { type: 'object' as const, properties: { reason_id: { type: 'string', description: 'Required' }, name: { type: 'string' }, display_order: { type: 'number' } }, required: ['reason_id'] },
      handler: async (args: Record<string, unknown>) => {
        const { reason_id, ...updates } = args
        return hasura.query({
          query: `mutation($set: lost_reasons_set_input!) { update_lost_reasons_by_pk(pk_columns: {id: "${sanitize(reason_id as string)}"}, _set: $set) { id name display_order } }`,
          variables: { set: updates },
        })
      },
    },

    { name: 'crm_lost_reasons_delete', description: 'Delete a lost reason.',
      inputSchema: { type: 'object' as const, properties: { reason_id: { type: 'string', description: 'Required' } }, required: ['reason_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation { delete_lost_reasons_by_pk(id: "${sanitize(args.reason_id as string)}") { id } }`,
      }),
    },

    // ═══ FORM CONFIGS ═══

    { name: 'crm_form_configs_list', description: 'List form configurations.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' } }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `{ form_configs(where: {product_id: {_eq: "${sanitize(args.product_id as string)}"}}) { id product_id form_type form_slug title description is_active settings created_at updated_at form_field_mappings { id source_field target_field target_table transform_type is_required field_order } } }`,
      }),
    },

    { name: 'crm_form_configs_create', description: 'Create a form configuration.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' }, form_type: { type: 'string', description: 'Required' },
        form_slug: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
        is_active: { type: 'boolean' }, settings: { type: 'object' },
      }, required: ['product_id', 'form_type'] },
      handler: async (args: Record<string, unknown>) => hasura.query({
        query: `mutation($input: form_configs_insert_input!) { insert_form_configs_one(object: $input) { id form_type form_slug title is_active created_at } }`,
        variables: { input: args },
      }),
    },

    // ═══ DASHBOARD STATS ═══

    { name: 'crm_dashboard_stats', description: 'Get CRM dashboard summary — leads, payments, follow-ups for current period.',
      inputSchema: { type: 'object' as const, properties: { product_id: { type: 'string', description: 'Required' } }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => {
        const pid = sanitize(args.product_id as string)
        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const today = now.toISOString().split('T')[0]

        return hasura.query({
          query: `{
            total_leads: leads_aggregate(where: {product_id: {_eq: "${pid}"}, is_deleted: {_eq: false}}) { aggregate { count } }
            month_leads: leads_aggregate(where: {product_id: {_eq: "${pid}"}, is_deleted: {_eq: false}, created_at: {_gte: "${monthStart}"}}) { aggregate { count } }
            success_leads: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "SUCCESS_LEAD"}, is_deleted: {_eq: false}}) { aggregate { count } }
            month_success: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "SUCCESS_LEAD"}, is_deleted: {_eq: false}, created_at: {_gte: "${monthStart}"}}) { aggregate { count } }
            total_calls: calls_aggregate(where: {product_id: {_eq: "${pid}"}}) { aggregate { count } }
            month_calls: calls_aggregate(where: {product_id: {_eq: "${pid}"}, created_at: {_gte: "${monthStart}"}}) { aggregate { count } }
            total_payments: payments_aggregate(where: {product_id: {_eq: "${pid}"}}) { aggregate { count sum { total_amount } } }
            month_payments: payments_aggregate(where: {product_id: {_eq: "${pid}"}, created_at: {_gte: "${monthStart}"}}) { aggregate { count sum { total_amount } } }
            overdue_followups: calls_aggregate(where: {product_id: {_eq: "${pid}"}, follow_up_date: {_lt: "${today}", _is_null: false}}) { aggregate { count } }
            today_followups: calls_aggregate(where: {product_id: {_eq: "${pid}"}, follow_up_date: {_eq: "${today}"}}) { aggregate { count } }
            recent_leads: leads(where: {product_id: {_eq: "${pid}"}, is_deleted: {_eq: false}}, order_by: {created_at: desc}, limit: 5) { id name phone sell_status source created_at }
          }`,
        })
      },
    },

    // ═══ SALES PERFORMANCE ═══

    { name: 'crm_sales_performance', description: 'Get sales performance metrics — conversion rate, speed to lead, lost reason distribution.',
      inputSchema: { type: 'object' as const, properties: {
        product_id: { type: 'string', description: 'Required' },
        start_date: { type: 'string', description: 'ISO date' }, end_date: { type: 'string', description: 'ISO date' },
        member_id: { type: 'string', description: 'Filter by team member' },
      }, required: ['product_id'] },
      handler: async (args: Record<string, unknown>) => {
        const pid = sanitize(args.product_id as string)
        const df: string[] = []
        if (args.start_date) df.push(`created_at: {_gte: "${sanitize(args.start_date as string)}"}`)
        if (args.end_date) df.push(`created_at: {_lte: "${sanitize(args.end_date as string)}"}`)
        const memberFilter = args.member_id ? `, assigned_member_id: {_eq: "${sanitize(args.member_id as string)}"}` : ''
        const dw = df.length ? `, ${df.join(', ')}` : ''

        return hasura.query({
          query: `{
            total: leads_aggregate(where: {product_id: {_eq: "${pid}"}, is_deleted: {_eq: false}${dw}${memberFilter}}) { aggregate { count } }
            success: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "SUCCESS_LEAD"}, is_deleted: {_eq: false}${dw}${memberFilter}}) { aggregate { count } }
            rejected: leads_aggregate(where: {product_id: {_eq: "${pid}"}, sell_status: {_eq: "REJECTED"}, is_deleted: {_eq: false}${dw}${memberFilter}}) { aggregate { count } }
            calls: calls_aggregate(where: {product_id: {_eq: "${pid}"}${dw}}) { aggregate { count } }
            answered_calls: calls_aggregate(where: {product_id: {_eq: "${pid}"}, call_status: {_eq: "ANSWERED"}${dw}}) { aggregate { count } }
            revenue: payments_aggregate(where: {product_id: {_eq: "${pid}"}${dw}}) { aggregate { sum { total_amount } } }
          }`,
        })
      },
    },
  ]
}
