import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { handleWebhook } from '../../../providers/payment/euplatesc';
import { buildOrderEventData } from '../../../lib/event-payload';
import type { HandlerDeps } from '../../../lib/handler-types';
import type { Ctx } from '../../../lib/types';

/**
 * euPlatesc IPN (Instant Payment Notification) endpoint.
 * Public endpoint — secured by HMAC signature verification.
 *
 * Always returns plain text "OK" with HTTP 200, regardless of outcome.
 * euPlatesc retries on non-200 responses, so we must never return an error status.
 * Errors are logged server-side.
 */
export const POST: APIRoute = async ({ request }) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: { request } as Ctx });
};

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const result = await handleWebhook(db, ctx.request);

    // Fire event only when this call caused a fresh transition to paid
    if (result.transitioned === true && result.order_id) {
      const data = await buildOrderEventData(db, result.order_id, 'shop.order.paid');
      sdk.events.publish('shop.order.paid', data);
    }
  } catch (err) {
    // Log the error but still return OK — euPlatesc retries on non-200
    console.error('[euPlatesc webhook] Error processing IPN:', err);
  }

  // Always return plain text OK with 200
  return new Response('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}
