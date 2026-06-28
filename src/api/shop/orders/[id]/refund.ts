import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import {
  recordLineItemRefund,
  getOrderWithItems,
  RefundError,
} from '../../../../lib/data/orders';
import { LineItemRefundSchema } from '../../../../schemas/order.schema';
import type { HandlerDeps } from '../../../../lib/handler-types';

/** Statuses from which a line-item refund transition is allowed. */
const REFUNDABLE_STATUSES = ['delivered', 'partially_refunded'];

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

    const parsed = LineItemRefundSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({
        success: false, error: 'Validation failed',
        fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])),
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    // Load order BEFORE any write to validate the status (validate-before-write).
    const result = await getOrderWithItems(db, orderId);
    if (!result) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!REFUNDABLE_STATUSES.includes(result.order.status)) {
      return new Response(JSON.stringify({
        success: false, error: `Order in status '${result.order.status}' is not refundable`,
      }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    // recordLineItemRefund runs validate-before-write inside its own transaction:
    // it re-checks the status, validates each refund line's quantity invariant,
    // inserts order_refunds rows, restocks, and transitions to partially_refunded/refunded.
    try {
      await recordLineItemRefund(db, orderId, parsed.data, 'admin');
    } catch (err: any) {
      if (err instanceof RefundError) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 422, headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }

    const updated = await getOrderWithItems(db, orderId);

    return new Response(JSON.stringify({
      success: true,
      data: { order: updated!.order },
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
