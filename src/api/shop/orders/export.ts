import type { APIRoute } from 'astro';
import { db, orders, sql as dbSql } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';

/**
 * GET /api/plugins/shop/orders/export — export orders as CSV.
 *
 * Accepts same query filters as list endpoint but without pagination.
 * Returns all matching orders in CSV format.
 */
export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();
  try {
    await sdk.auth.requireAdmin(context.request);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const url = new URL(context.request.url);
  const statusFilter = url.searchParams.get('status');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const search = url.searchParams.get('search');

  const conditions: string[] = [];
  const params: any[] = [];

  if (statusFilter) {
    const statuses = statusFilter.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      const placeholders = statuses.map(() => '?').join(', ');
      conditions.push(`${orders.status.name} IN (${placeholders})`);
      params.push(...statuses);
    }
  }

  if (from) {
    conditions.push(`${orders.created_at.name} >= ?`);
    params.push(from);
  }

  if (to) {
    conditions.push(`${orders.created_at.name} <= ?`);
    params.push(to);
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      `(${orders.order_number.name} LIKE ? OR ${orders.customer_name.name} LIKE ? OR ${orders.customer_email.name} LIKE ?)`,
    );
    params.push(pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Fetch all matching orders (no pagination)
  const dataSql = `SELECT * FROM ${orders} ${whereClause} ORDER BY ${orders.created_at.name} DESC`;
  const dataResult = await db.run(dataSql, params);

  const rows = dataResult.rows as any[];

  // CSV columns (matching design.md)
  const columns = [
    'order_number', 'created_at', 'status', 'customer_name', 'customer_email',
    'customer_type', 'billing_company', 'billing_vat_number', 'currency',
    'subtotal_net', 'vat_total', 'shipping_cost', 'discount_amount', 'total',
    'shipping_type', 'shipping_method', 'voucher_code', 'referral_code',
    'payment_provider', 'transaction_id', 'refund_amount', 'notes',
  ];

  // Build CSV
  const header = columns.join(',');
  const csvRows = rows.map((row) =>
    columns.map((col) => {
      const value = row[col];
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Escape commas and quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(','),
  );

  const csv = [header, ...csvRows].join('\n');

  const dateStr = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="orders-${dateStr}.csv"`,
    },
  });
};