import Stripe from 'stripe';
import { db, shop_settings, orders, sql as dbSql } from 'astro:db';
import { decryptIfNeeded } from '../../lib/crypto'
import { transitionOrder } from '../../lib/order-transitions'
import { registerProvider } from './registry'
import type {
  PaymentProvider,
  PaymentOrder,
  PaymentOptions,
  PaymentInitResult,
  WebhookResult,
} from './interface'

async function getSetting(key: string): Promise<string | null> {
  const result = await db.run(
    dbSql`SELECT value FROM ${shop_settings}
          WHERE ${shop_settings.key} = ${key} LIMIT 1`,
  );
  if (result.rows.length > 0) {
    return (result.rows[0] as any).value;
  }
  return null;
}

async function getStripeClient(): Promise<Stripe | null> {
  const encryptedKey = await getSetting('stripe_secret_key');
  if (!encryptedKey) return null;
  const secretKey = decryptIfNeeded(encryptedKey);
  return new Stripe(secretKey, {
    apiVersion: '2025-06-16.acacia' as any,
  });
}

async function initiatePayment(
  order: PaymentOrder,
  options: PaymentOptions,
): Promise<PaymentInitResult> {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured. Set stripe_secret_key in shop settings.');
  }

  // Create a Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: `${options.success_url}?order=${order.id}`,
    cancel_url: options.cancel_url,
    client_reference_id: order.id,
    customer_email: order.customer_email,
    metadata: { order_id: order.id },
    line_items: [
      {
        price_data: {
          currency: order.currency.toLowerCase(),
          product_data: {
            name: `Order ${order.order_number}`,
          },
          unit_amount: Math.round(order.total * 100), // Stripe works in cents
        },
        quantity: 1,
      },
    ],
  });

  // Update order payment_intent_id
  await db.run(
    dbSql`UPDATE ${orders}
          SET ${orders.payment_intent_id} = ${session.id}
          WHERE ${orders.id} = ${order.id}`,
  );

  // Transition order to awaiting_payment
  await transitionOrder(order.id, 'awaiting_payment', 'Payment initiated via Stripe');

  return {
    redirect_url: session.url!,
    provider_session_id: session.id,
  };
}

async function handleWebhook(request: Request): Promise<WebhookResult> {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured.');
  }

  const webhookSecret = await getSetting('stripe_webhook_secret');
  if (!webhookSecret) {
    throw new Error('Stripe webhook secret is not configured.');
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      decryptIfNeeded(webhookSecret),
    );
  } catch (err: any) {
    throw new Error(`Invalid Stripe webhook signature: ${err.message}`);
  }

  // Find the order by client_reference_id from the session
  const session = event.data.object as any;
  const orderId = session.client_reference_id ?? session.metadata?.order_id;

  if (!orderId) {
    throw new Error('No order reference found in Stripe event.');
  }

  // Verify order exists
  const orderResult = await db.run(
    dbSql`SELECT id FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );
  if (orderResult.rows.length === 0) {
    throw new Error(`Order not found: ${orderId}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await transitionOrder(orderId, 'paid', 'Payment confirmed via Stripe webhook');
      // Store transaction_id
      await db.run(
        dbSql`UPDATE ${orders}
              SET ${orders.transaction_id} = ${session.payment_intent ?? session.id}
              WHERE ${orders.id} = ${orderId}`,
      );
      return {
        order_id: orderId,
        status: 'paid',
        transaction_id: session.payment_intent ?? session.id,
      };

    case 'payment_intent.payment_failed': {
      const reason = session.last_payment_error?.message ?? 'Payment failed';
      await transitionOrder(orderId, 'awaiting_payment', `Payment failed: ${reason}`);
      return {
        order_id: orderId,
        status: 'failed',
        error: reason,
      };
    }

    default:
      return {
        order_id: orderId,
        status: 'pending',
      };
  }
}

const stripeProvider: PaymentProvider = {
  name: 'stripe',
  refundable: true,
  initiatePayment,
  handleWebhook,
};

// Auto-register on import
registerProvider(stripeProvider);

export { initiatePayment, handleWebhook };
export default stripeProvider;