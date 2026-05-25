import type { APIRoute } from 'astro';
import { handleWebhook } from '../../../providers/payment/euplatesc.ts';

/**
 * euPlatesc IPN (Instant Payment Notification) endpoint.
 * Public endpoint — secured by HMAC signature verification.
 * Returns the euPlatesc-expected response format: <EPAYMENT>date|OK</EPAYMENT>
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const result = await handleWebhook(request);

    if (result.status === 'paid') {
      // euPlatesc expects this exact format for successful IPN
      const now = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      return new Response(`<EPAYMENT>${now}|OK</EPAYMENT>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    const message = err.message ?? 'Server Error';
    const isInvalidSig = message.includes('Invalid') || message.includes('signature');

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: isInvalidSig ? 400 : 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};