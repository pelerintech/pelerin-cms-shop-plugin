import type { APIRoute } from 'astro';
import { db, orders, sql as dbSql } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { transitionOrder } from '../../../../lib/order-transitions.ts';
import { RefundOrderSchema } from '../../../../schemas/order.schema.ts';

/**
 * PUT /api/plugins/shop/orders/[id]/refund — record a refund for an order.
 *
 * Body: { refund_amount: number, refund_notes?: string }
 * Transitions order to refunded.
 */
export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();
  try {
    await sdk.auth.requireAdmin(context.request);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const orderId = context.params.id;

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const parsed = RefundOrderSchema.safeParse(body);
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

  const { refund_amount, refund_notes } = parsed.data;

  // Load order to check total
  const orderResult = await db.run(
    dbSql`SELECT total, status FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );
  if (orderResult.rows.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'Order not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const order = orderResult.rows[0] as any;

  if (refund_amount > order.total) {
    return new Response(
      JSON.stringify({ success: false, error: 'Refund amount exceeds order total' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Store refund data
  await db.run(
    dbSql`UPDATE ${orders}
          SET ${orders.refund_amount} = ${refund_amount},
              ${orders.refund_notes} = ${refund_notes ?? null},
              ${orders.refunded_at} = ${new Date().toISOString()}
          WHERE ${orders.id} = ${orderId}`,
  );

  // Transition to refunded
  await transitionOrder(orderId, 'refunded', refund_notes ?? 'Refund recorded by admin', 'admin');

  // Fetch updated order
  const updated = await db.run(
    dbSql`SELECT * FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );

  return new Response(
    JSON.stringify({ success: true, data: updated.rows[0] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};