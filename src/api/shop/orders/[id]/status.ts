import type { APIRoute } from 'astro';
import { db, orders, sql as dbSql } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { transitionOrder } from '../../../../lib/order-transitions'
import { UpdateOrderStatusSchema } from '../../../../schemas/order.schema'

/**
 * PUT /api/plugins/shop/orders/[id]/status — transition order status.
 *
 * Body: { status: OrderStatus, note?: string }
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

  // Parse and validate body
  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const parsed = UpdateOrderStatusSchema.safeParse(body);
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

  const { status, note } = parsed.data;

  try {
    await transitionOrder(orderId, status, note ?? undefined, 'admin');
  } catch (err: any) {
    const message = err.message ?? 'Transition failed';
    const isInvalidTransition = message.includes('Invalid status transition') ||
      message.includes('Cannot transition');

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: isInvalidTransition ? 409 : 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Fetch updated order
  const updated = await db.run(
    dbSql`SELECT * FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );

  return new Response(
    JSON.stringify({ success: true, data: updated.rows[0] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};