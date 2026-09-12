import { errorFields } from '../../../../lib/errors.ts';
import type { AnyDb } from '../../../../lib/types.ts';
import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  transitionOrderStatus,
  getOrderWithItems,
  restockOrderItems,
} from '../../../../lib/data/orders';
import { buildOrderEventData } from '../../../../lib/event-payload';
import type { HandlerDeps } from '../../../../lib/handler-types';

const CANCELLABLE_STATUSES = ['pending', 'awaiting_payment', 'paid', 'processing'];

export const PUT: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPut({ db: sdk.db, sdk, ctx: context });
};

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const orderId = ctx.params.id!;
    const result = await getOrderWithItems(db, orderId);
    if (!result) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!CANCELLABLE_STATUSES.includes(result.order.status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cannot cancel order that has been ${result.order.status}`,
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Restock all line items + transition to cancelled, atomically. If the
    // transition throws, the restock is rolled back (no stock restored for an
    // order that didn't actually cancel).
    await db.transaction(async (tx: AnyDb) => {
      await restockOrderItems(tx, orderId);
      await transitionOrderStatus(tx, orderId, 'cancelled', 'Order cancelled by admin', 'admin');
    });

    // Fire shop.order.cancelled event
    const data = await buildOrderEventData(db, orderId, 'shop.order.cancelled');
    sdk.events.publish('shop.order.cancelled', data);

    const updated = await getOrderWithItems(db, orderId);

    return new Response(JSON.stringify({ success: true, data: updated!.order }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const status = errorFields(err).status ?? 500;
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
