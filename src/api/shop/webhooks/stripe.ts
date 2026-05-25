import type { APIRoute } from 'astro';
import { handleWebhook } from '../../../providers/payment/stripe.ts';

/**
 * Stripe webhook endpoint — receives events from Stripe.
 * Public endpoint (no admin auth — secured by HMAC signature verification).
 * Uses request.text() to preserve raw body for signature validation.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const result = await handleWebhook(request);
    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    const message = err.message ?? 'Server Error';
    const isInvalidSig = message.includes('Invalid') || message.includes('signature');
    const isNotFound = message.includes('not found') || message.includes('Order not found');

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: isInvalidSig ? 400 : isNotFound ? 404 : 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};