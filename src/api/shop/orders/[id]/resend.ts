import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import type { HandlerDeps } from '../../../../lib/handler-types';

/**
 * POST /api/plugins/shop/orders/[id]/resend-confirmation — resend order confirmation email.
 *
 * TODO: When the CMS event bus is available, this should emit a
 * `shop.order.confirmation_requested` event instead of returning a stub.
 */
export const POST: APIRoute = (context) =>
  runPost({ db: undefined as any, sdk: createPluginContext(), ctx: context });

export async function runPost({ sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
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
}
