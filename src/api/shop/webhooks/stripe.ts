import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { handleWebhook as realHandleWebhook } from '../../../providers/payment/stripe';
import { buildOrderEventPayload } from '../../../lib/event-payload';
import type { HandlerDeps } from '../../../lib/handler-types';

/**
 * Stripe webhook endpoint — receives events from Stripe.
 * Public endpoint (no admin auth — secured by HMAC signature verification).
 * Uses request.text() to preserve raw body for signature validation.
 */
export const POST: APIRoute = async ({ request }) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: { request } as any });
};

export async function runPost(
  { db, sdk, ctx }: HandlerDeps,
  injectedHandleWebhook: typeof realHandleWebhook = realHandleWebhook
): Promise<Response> {
  try {
    const result = await injectedHandleWebhook(db, ctx.request);

    // Fire event if payment was confirmed
    if (result.status === 'paid' && result.order_id) {
      const payload = await buildOrderEventPayload(db, result.order_id, 'shop.order.paid');
      sdk.events.publish('shop.order.paid', payload);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const message = err.message ?? 'Server Error';
    const isInvalidSig = message.includes('Invalid') || message.includes('signature');
    const isNotFound = message.includes('not found') || message.includes('Order not found');

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: isInvalidSig ? 400 : isNotFound ? 404 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
