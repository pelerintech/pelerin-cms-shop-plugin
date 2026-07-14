import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrderWithItems } from '../../../../lib/data/orders';
import { getProvider, listProviders } from '../../../../providers/payment/registry';
import type { HandlerDeps } from '../../../../lib/handler-types';
import type { PaymentOrder, PaymentOptions } from '../../../../providers/payment/interface';

// Import provider modules to ensure they're registered
import '../../../../providers/payment/euplatesc';
import '../../../../providers/payment/stripe';

export const POST: APIRoute = (context) => { const sdk = createPluginContext(); return runPost({ db: sdk.db, sdk, ctx: context }); }

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const orderId = ctx.params.id!;

  let body: any;
  try { body = await ctx.request.json(); } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const providerName = body?.provider;
  if (!providerName || typeof providerName !== 'string') {
    return new Response(JSON.stringify({ success: false, error: 'provider is required' }), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check provider is registered and configured
  const provider = getProvider(providerName);
  if (!provider) {
    return new Response(JSON.stringify({ success: false, error: `Unknown provider: ${providerName}` }), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    });
  }

  const isConfig = await provider.isConfigured(db);
  if (!isConfig) {
    return new Response(JSON.stringify({ success: false, error: `Provider ${providerName} is not configured` }), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Load the order
  const result = await getOrderWithItems(db, orderId);
  if (!result) {
    return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const order = result.order;

  // Build PaymentOrder
  const paymentOrder: PaymentOrder = {
    id: order.id,
    order_number: order.order_number,
    currency: order.currency,
    total: order.total,
    customer_email: order.customer_email,
    customer_name: order.customer_name,
    status: order.status,
  };

  // Derive URLs from request origin
  const origin = new URL(ctx.request.url).origin;
  const successUrl = body.success_url || `${origin}/admin/plugins/shop/orders/${orderId}?payment=success`;
  const cancelUrl = body.cancel_url || `${origin}/admin/plugins/shop/orders/${orderId}?payment=failed`;
  const webhookUrl = `${origin}/api/plugins/shop/webhooks/${providerName}`;

  const paymentOptions: PaymentOptions = {
    success_url: successUrl,
    cancel_url: cancelUrl,
    webhook_url: webhookUrl,
    currency: order.currency,
    locale: body.locale,
  };

  try {
    const paymentResult = await provider.initiatePayment(db, paymentOrder, paymentOptions);

    return new Response(JSON.stringify({
      success: true,
      data: {
        redirect_url: paymentResult.redirect_url,
        provider_session_id: paymentResult.provider_session_id,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Payment initiation failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
