import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { getProvider } from '../../../../../providers/payment/registry';
import '../../../../../providers/payment/stripe';
import '../../../../../providers/payment/euplatesc';
import type { PaymentOrder, PaymentOptions } from '../../../../../providers/payment/interface';
import { getOrderWithItems } from '../../../../../lib/data/orders';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const POST: APIRoute = (context) =>
  runPost({ db, sdk: createPluginContext(), ctx: context });

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const orderId = ctx.params.orderId!;
    const body = await ctx.request.json();
    const { provider } = body;

    if (!provider) {
      return new Response(JSON.stringify({ success: false, error: 'provider is required' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    const paymentProvider = getProvider(provider.toLowerCase());
    if (!paymentProvider) {
      return new Response(JSON.stringify({ success: false, error: 'Unknown payment provider' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await getOrderWithItems(db, orderId);
    if (!result) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const o = result.order;
    const paymentOrder: PaymentOrder = {
      id: o.id,
      order_number: o.order_number,
      currency: o.currency,
      total: o.total,
      customer_email: o.customer_email,
      customer_name: o.customer_name,
    };

    const paymentOptions: PaymentOptions = {
      order: paymentOrder,
      provider,
      returnUrl: `${new URL(ctx.request.url).origin}/api/plugins/shop/public/checkout/${orderId}/pay?provider=${provider}`,
    };

    const paymentResult = await paymentProvider.initiatePayment(paymentOptions);

    return new Response(JSON.stringify({ success: true, data: paymentResult }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
