import type { APIRoute } from 'astro';
import { db, orders, order_items, order_status_history, sql as dbSql } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';

/**
 * GET /api/plugins/shop/orders/[id] — full order detail with items, status history, and addresses.
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

  const orderId = context.params.id;

  // Fetch order
  const orderResult = await db.run(
    dbSql`SELECT * FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );
  if (orderResult.rows.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'Order not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const order = orderResult.rows[0];

  // Fetch order items
  const itemsResult = await db.run(
    dbSql`SELECT * FROM ${order_items}
          WHERE ${order_items.order_id} = ${orderId}
          ORDER BY ${order_items.created_at} ASC`,
  );

  // Fetch status history (chronological)
  const historyResult = await db.run(
    dbSql`SELECT * FROM ${order_status_history}
          WHERE ${order_status_history.order_id} = ${orderId}
          ORDER BY ${order_status_history.created_at} ASC`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        ...order,
        items: itemsResult.rows,
        status_history: historyResult.rows,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
