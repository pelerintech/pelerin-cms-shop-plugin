import type { APIRoute } from 'astro';
import { db, orders, sql as dbSql } from 'astro:db';
import { getProvider } from '../../../../providers/payment/registry.ts';
// Import adapters to ensure they are registered
import '../../../../providers/payment/stripe.ts';
import '../../../../providers/payment/euplatesc.ts';
import type { PaymentOrder, PaymentOptions } from '../../../../providers/payment/interface.ts';

export const POST: APIRoute = async (context) => {
  try {
    const orderId = context.params.orderId;
    const body = await context.request.json();
    const { provider } = body;

    if (!provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'provider is required' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const paymentProvider = getProvider(provider.toLowerCase());
    if (!paymentProvider) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unknown payment provider' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Verify the order exists and load it
    const orderResult = await db.run(
      dbSql`SELECT id, order_number, currency, total, customer_email, customer_name, status FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
    );
    if (orderResult.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const orderRow = orderResult.rows[0] as any;
    const order: PaymentOrder = {
      id: orderRow.id,
      order_number: orderRow.order_number,
      currency: orderRow.currency,
      total: orderRow.total,
      customer_email: orderRow.customer_email,
      customer_name: orderRow.customer_name,
      status: orderRow.status,
    };

    // Build payment options
    const requestUrl = new URL(context.request.url);
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    const options: PaymentOptions = {
      success_url: body.success_url ?? `${baseUrl}/shop/order/${orderId}/success`,
      cancel_url: body.cancel_url ?? `${baseUrl}/shop/order/${orderId}/cancel`,
      currency: order.currency,
      locale: body.locale,
    };

    const result = await paymentProvider.initiatePayment(order, options);

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Server Error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};