import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getProvider } from '../../../../../providers/payment/registry';
import '../../../../../providers/payment/stripe';
import '../../../../../providers/payment/euplatesc';
import '../../../../../providers/payment/bank_transfer';
import '../../../../../providers/payment/ramburs';
import type { PaymentOrder, PaymentOptions } from '../../../../../providers/payment/interface';
import { getOrderWithItems } from '../../../../../lib/data/orders';
import type { HandlerDeps } from '../../../../../lib/handler-types';

const OFFLINE_PROVIDERS = new Set(['bank_transfer', 'ramburs']);

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const orderId = ctx.params.orderId!;
    const body = await ctx.request.json();
    const { success_url, cancel_url } = body;

    // Client must provide success_url and cancel_url — the plugin is domain-agnostic
    if (!success_url || !cancel_url) {
      return new Response(
        JSON.stringify({ success: false, error: 'success_url and cancel_url are required' }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Load the order to read payment_provider
    const result = await getOrderWithItems(db, orderId);
    if (!result) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const o = result.order;

    // Guard: null payment_provider (defensive)
    if (!o.payment_provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'No payment provider on order' }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Guard: offline providers have no initiation
    if (OFFLINE_PROVIDERS.has(o.payment_provider)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `${o.payment_provider} is an offline provider; no initiation available`,
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Look up the payment provider
    const paymentProvider = getProvider(o.payment_provider);
    if (!paymentProvider) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Payment provider "${o.payment_provider}" not found`,
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Guard: provider is no longer configured
    const isConfigured = await paymentProvider.isConfigured(db);
    if (!isConfigured) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `${o.payment_provider} is no longer available`,
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const paymentOrder: PaymentOrder = {
      id: o.id,
      order_number: o.order_number,
      currency: o.currency,
      total: o.total,
      customer_email: o.customer_email,
      customer_name: o.customer_name,
      status: o.status,
    };

    const origin = new URL(ctx.request.url).origin;
    const paymentOptions: PaymentOptions = {
      success_url,
      cancel_url,
      webhook_url: `${origin}/api/plugins/shop/webhooks/${paymentProvider.name}`,
      currency: o.currency,
    };

    const paymentResult = await paymentProvider.initiatePayment(db, paymentOrder, paymentOptions);

    return new Response(JSON.stringify({ success: true, data: paymentResult }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
