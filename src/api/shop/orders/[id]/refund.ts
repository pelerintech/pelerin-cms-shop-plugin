import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { transitionOrderStatus, getOrderWithItems, recordOrderRefund } from '../../../../lib/data/orders';
import { RefundOrderSchema } from '../../../../schemas/order.schema';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const PUT: APIRoute = (context) =>
  runPut({ db, sdk: createPluginContext(), ctx: context });

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const orderId = ctx.params.id!;
    let body: any;
    try { body = await ctx.request.json(); } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsed = RefundOrderSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({
        success: false, error: 'Validation failed',
        fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])),
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    const { refund_amount, refund_notes } = parsed.data;
    const result = await getOrderWithItems(db, orderId);
    if (!result) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (refund_amount > result.order.total) {
      return new Response(JSON.stringify({ success: false, error: 'Refund amount exceeds order total' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    await recordOrderRefund(db, orderId, refund_amount, refund_notes ?? null);

    await transitionOrderStatus(db, orderId, 'refunded', refund_notes ?? 'Refund recorded by admin', 'admin');
    const updated = await getOrderWithItems(db, orderId);

    return new Response(JSON.stringify({ success: true, data: updated!.order }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
