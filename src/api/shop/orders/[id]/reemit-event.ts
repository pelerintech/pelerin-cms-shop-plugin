import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrderWithItems } from '../../../../lib/data/orders';
import { buildOrderEventPayload } from '../../../../lib/event-payload';
import type { HandlerDeps } from '../../../../lib/handler-types';
import { z } from 'zod';

/**
 * Map of event → set of statuses where the event is considered reachable.
 * An order's current status implies it passed through all prior statuses
 * (enforced by `validateTransition` at write time).
 */
const STATUS_MUST_HAVE_PASSED: Record<string, readonly string[]> = {
  'shop.order.confirmed': [], // any status
  'shop.order.paid': [
    'paid',
    'processing',
    'shipped',
    'delivered',
    'partially_refunded',
    'refunded',
    'cancelled',
  ],
  'shop.order.shipped': ['shipped', 'delivered', 'partially_refunded', 'refunded'],
  'shop.order.cancelled': ['cancelled'],
  'shop.order.refunded': ['refunded', 'partially_refunded'],
};

const VALID_EVENTS = Object.keys(STATUS_MUST_HAVE_PASSED);

const ReemitEventSchema = z.object({
  event: z
    .string()
    .min(1)
    .refine((val) => VALID_EVENTS.includes(val), {
      message: `Invalid event. Must be one of: ${VALID_EVENTS.join(', ')}`,
    }),
});

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const orderId = ctx.params.id!;
    let body: any;
    try {
      body = await ctx.request.json();
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsed = ReemitEventSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { event } = parsed.data;

    // Load the order to validate event matches status
    const result = await getOrderWithItems(db, orderId);
    if (!result) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate event matches the order's current status
    const allowedStatuses = STATUS_MUST_HAVE_PASSED[event];
    if (allowedStatuses && allowedStatuses.length > 0) {
      if (!allowedStatuses.includes(result.order.status)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Event '${event}' is not applicable for order in status '${result.order.status}'`,
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build payload and publish
    const payload = await buildOrderEventPayload(db, orderId, event);
    sdk.events.publish(event, payload);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
