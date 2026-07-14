import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { handleWebhook } from '../../../providers/payment/euplatesc';

/**
 * euPlatesc IPN (Instant Payment Notification) endpoint.
 * Public endpoint — secured by HMAC signature verification.
 *
 * Always returns plain text "OK" with HTTP 200, regardless of outcome.
 * euPlatesc retries on non-200 responses, so we must never return an error status.
 * Errors are logged server-side.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const sdk = createPluginContext();
    await handleWebhook(sdk.db, request);
  } catch (err) {
    // Log the error but still return OK — euPlatesc retries on non-200
    console.error('[euPlatesc webhook] Error processing IPN:', err);
  }

  // Always return plain text OK with 200
  return new Response('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
};
