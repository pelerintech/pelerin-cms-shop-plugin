import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';

/**
 * POST /api/plugins/shop/orders/[id]/resend-confirmation — resend order confirmation email.
 *
 * TODO: When the CMS event bus is available, this should emit a
 * `shop.order.confirmation_requested` event instead of returning a stub.
 */
export const POST: APIRoute = async (context) => {
  const sdk = createPluginContext();
  try {
    await sdk.auth.requireAdmin(context.request);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Email notifications not yet configured',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};