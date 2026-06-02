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

  const conditions: any[] = [];

  if (statusFilter) {
    const statuses = statusFilter.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      conditions.push(
        dbSql`${orders.status} IN (${dbSql.join(statuses.map(s => dbSql`${s}`))})`
      );
    }
  }

  if (from) {
    conditions.push(dbSql`${orders.created_at} >= ${from}`);
  }

  if (to) {
    conditions.push(dbSql`${orders.created_at} <= ${to}`);
  }

  if (search) {
    conditions.push(dbSql`(${orders.order_number} LIKE ${'%' + search + '%'} OR ${orders.customer_name} LIKE ${'%' + search + '%'} OR ${orders.customer_email} LIKE ${'%' + search + '%'})`);
  }

  const whereClause = dbSql.join(conditions, ' AND ');

  // Fetch all matching orders (no pagination)
  const dataResult = await db.run(
    conditions.length > 0
      ? dbSql`SELECT * FROM ${orders} WHERE ${whereClause} ORDER BY ${orders.created_at} DESC`
      : dbSql`SELECT * FROM ${orders} ORDER BY ${orders.created_at} DESC`
  );

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