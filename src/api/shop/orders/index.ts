import type { APIRoute } from 'astro';
import { db, orders, order_items, order_status_history, products, product_variants, sql as dbSql } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { generateOrderNumber } from '../../../lib/order-number'
import { CreateOrderSchema } from '../../../schemas/order.schema'

/**
 * GET /api/plugins/shop/orders — list orders with filters, search, pagination.
 *
 * Query params:
 *   status   — comma-separated statuses (e.g. ?status=paid,processing)
 *   from     — ISO date (created_at >=)
 *   to       — ISO date (created_at <=)
 *   search   — LIKE match on order_number, customer_name, customer_email
 *   page     — page number (default 1)
 *   limit    — items per page (default 50)
 *   sort     — column to sort by (default created_at)
 *   dir      — sort direction (asc/desc, default desc)
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
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const sort = url.searchParams.get('sort') ?? 'created_at';
  const dir = url.searchParams.get('dir')?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Whitelist sort columns to prevent SQL injection
  const allowedSortColumns = ['created_at', 'updated_at', 'order_number', 'total', 'status'];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';

  // Build WHERE clauses using dbSql fragments
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

  // Sort — map validated column name to column object
  const sortColMap: Record<string, any> = {
    created_at: orders.created_at,
    updated_at: orders.updated_at,
    order_number: orders.order_number,
    total: orders.total,
    status: orders.status,
  };
  const sortCol = sortColMap[sortColumn] ?? orders.created_at;

  const offset = (page - 1) * limit;

  // Count total matching rows
  const countResult = await db.run(
    conditions.length > 0
      ? dbSql`SELECT COUNT(*) as total FROM ${orders} WHERE ${whereClause}`
      : dbSql`SELECT COUNT(*) as total FROM ${orders}`
  );
  const total = (countResult.rows[0] as any).total;

  // Fetch paginated rows
  const dataResult = await db.run(
    conditions.length > 0
      ? dbSql`SELECT * FROM ${orders} WHERE ${whereClause} ORDER BY ${sortCol} ${dbSql.raw(dir)} LIMIT ${limit} OFFSET ${offset}`
      : dbSql`SELECT * FROM ${orders} ORDER BY ${sortCol} ${dbSql.raw(dir)} LIMIT ${limit} OFFSET ${offset}`
  );

  return new Response(
    JSON.stringify({
      success: true,
      data: dataResult.rows,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

/**
 * POST /api/plugins/shop/orders — manually create an order (admin-initiated).
 *
 * Admin-created orders bypass payment initiation. Status stays `pending` and
 * admin transitions manually.
 */
export const POST: APIRoute = async (context) => {
  const sdk = createPluginContext();
  try {
    await sdk.auth.requireAdmin(context.request);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Validate with Zod
  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      fields[path] = issue.message;
    }
    return new Response(
      JSON.stringify({ success: false, error: 'Validation failed', fields }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const data = parsed.data;

  // Validate stock for each item
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (item.variant_id) {
      const variantResult = await db.run(
        dbSql`SELECT stock FROM ${product_variants}
              WHERE ${product_variants.id} = ${item.variant_id} LIMIT 1`,
      );
      const variant = variantResult.rows[0] as any;
      if (variant && variant.stock !== null && variant.stock < item.quantity) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Insufficient stock',
            fields: { [`items[${i}]`]: `Requested ${item.quantity}, available ${variant.stock}` },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }
    } else if (item.product_id) {
      const productResult = await db.run(
        dbSql`SELECT stock FROM ${products}
              WHERE ${products.id} = ${item.product_id} LIMIT 1`,
      );
      const product = productResult.rows[0] as any;
      if (product && product.stock !== null && product.stock < item.quantity) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Insufficient stock',
            fields: { [`items[${i}]`]: `Requested ${item.quantity}, available ${product.stock}` },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }
  }

  // Generate order number
  const orderNumber = await generateOrderNumber();
  const orderId = crypto.randomUUID();
  const now = new Date();

  // Insert order (status always pending for admin-created orders)
  await db.insert(orders).values({
    id: orderId,
    order_number: orderNumber,
    user_id: data.user_id,
    customer_type: data.customer_type,
    customer_email: data.customer_email,
    customer_name: data.customer_name,
    customer_phone: data.customer_phone,
    status: 'pending',
    currency: data.currency,
    subtotal_net: data.subtotal_net,
    vat_total: data.vat_total,
    shipping_cost: data.shipping_cost,
    discount_amount: data.discount_amount,
    total: data.total,
    shipping_type: data.shipping_type,
    shipping_method: data.shipping_method,
    voucher_code: data.voucher_code,
    referral_code: data.referral_code,
    billing_first_name: data.billing_first_name,
    billing_last_name: data.billing_last_name,
    billing_address: data.billing_address,
    billing_city: data.billing_city,
    billing_postal_code: data.billing_postal_code,
    billing_country: data.billing_country,
    billing_county: data.billing_county,
    billing_phone: data.billing_phone,
    billing_company: data.billing_company,
    billing_vat_number: data.billing_vat_number,
    shipping_first_name: data.shipping_first_name ?? '',
    shipping_last_name: data.shipping_last_name ?? '',
    shipping_address: data.shipping_address ?? '',
    shipping_city: data.shipping_city ?? '',
    shipping_postal_code: data.shipping_postal_code ?? '',
    shipping_country: data.shipping_country ?? '',
    shipping_county: data.shipping_county,
    shipping_phone: data.shipping_phone,
    shipping_company: data.shipping_company,
    shipping_vat_number: data.shipping_vat_number,
    shipping_same_as_billing: data.shipping_same_as_billing,
    payment_provider: data.payment_provider,
    payment_intent_id: data.payment_intent_id,
    transaction_id: null,
    refund_amount: null,
    refund_notes: null,
    refunded_at: null,
    notes: data.notes,
    created_at: now,
    updated_at: now,
  });

  // Insert order items (snapshot)
  for (const item of data.items) {
    await db.insert(order_items).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name,
      sku: item.sku,
      quantity: item.quantity,
      price_net: item.price_net,
      vat_rate: item.vat_rate,
      price_gross: item.price_gross,
      currency: item.currency,
    });
  }

  // Insert initial status history
  await db.insert(order_status_history).values({
    id: crypto.randomUUID(),
    order_id: orderId,
    from_status: null,
    to_status: 'pending',
    note: 'Order created by admin',
    changed_by: 'admin',
    created_at: now,
  });

  // Fetch created order
  const created = await db.run(
    dbSql`SELECT * FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );

  return new Response(
    JSON.stringify({ success: true, data: created.rows[0] }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
};
