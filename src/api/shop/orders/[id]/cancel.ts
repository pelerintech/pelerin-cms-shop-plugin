import type { APIRoute } from 'astro';
import { db, orders, sql as dbSql } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { transitionOrder } from '../../../../lib/order-transitions.ts';

/** Statuses from which an order CAN be cancelled. */
const CANCELLABLE_STATUSES = ['pending', 'awaiting_payment', 'paid', 'processing'];

/**
 * PUT /api/plugins/shop/orders/[id]/cancel — cancel an order.
 *
 * Only cancellable if status is pending, awaiting_payment, paid, or processing.
 * Shipped/delivered orders cannot be cancelled.
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

  // Load current order to check cancellable status
  const orderResult = await db.run(
    dbSql`SELECT status FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );
  if (orderResult.rows.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'Order not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const currentStatus = (orderResult.rows[0] as any).status;

  if (!CANCELLABLE_STATUSES.includes(currentStatus)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Cannot cancel order that has been ${currentStatus}`,
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  await transitionOrder(orderId, 'cancelled', 'Order cancelled by admin', 'admin');

  // Fetch updated order
  const updated = await db.run(
    dbSql`SELECT * FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );

  return new Response(
    JSON.stringify({ success: true, data: updated.rows[0] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};