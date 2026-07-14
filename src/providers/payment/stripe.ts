import Stripe from 'stripe';
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { orders } from '../../db/schema';
import { decryptIfNeeded } from '../../lib/crypto';
import { transitionOrder } from '../../lib/order-transitions';
import { getSetting } from '../../lib/data/settings';
import { registerProvider } from './registry';
import type {
  PaymentProvider,
  PaymentOrder,
  PaymentOptions,
  PaymentInitResult,
  WebhookResult,
  RefundResult,
} from './interface';

async function getStripeClient(db: LibSQLDatabase): Promise<Stripe | null> {
  const encryptedKey = await getSetting(db, 'stripe_secret_key');
  if (!encryptedKey) return null;
  const secretKey = decryptIfNeeded(encryptedKey);
  return new Stripe(secretKey, {
    apiVersion: '2025-06-16.acacia' as any,
  });
}

async function initiatePayment(
  db: LibSQLDatabase,
  order: PaymentOrder,
  options: PaymentOptions,
): Promise<PaymentInitResult> {
  const stripe = await getStripeClient(db);
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
          unit_amount: order.total, // Stripe works in minor units (cents/bani), same as our storage
        },
        quantity: 1,
      },
    ],
  });

  // Update order payment fields
  await db
    .update(orders)
    .set({ payment_intent_id: session.id, payment_provider: 'stripe' })
    .where(sql`${orders.id} = ${order.id}`);

  // Transition order to awaiting_payment
  await transitionOrder(db, order.id, 'awaiting_payment', 'Payment initiated via Stripe');

  return {
    redirect_url: session.url!,
    provider_session_id: session.id,
  };
}

async function handleWebhook(db: LibSQLDatabase, request: Request): Promise<WebhookResult> {
  const stripe = await getStripeClient(db);
  if (!stripe) {
    throw new Error('Stripe is not configured.');
  }

  const webhookSecret = await getSetting(db, 'stripe_webhook_secret');
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
  const orderResult = await db
    .select({ id: orders.id })
    .from(orders)
    .where(sql`${orders.id} = ${orderId}`)
    .limit(1);
  if (orderResult.length === 0) {
    throw new Error(`Order not found: ${orderId}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await transitionOrder(db, orderId, 'paid', 'Payment confirmed via Stripe webhook');
      // Store transaction_id
      await db
        .update(orders)
        .set({ transaction_id: session.payment_intent ?? session.id })
        .where(sql`${orders.id} = ${orderId}`);
      return {
        order_id: orderId,
        status: 'paid',
        transaction_id: session.payment_intent ?? session.id,
      };

    case 'payment_intent.payment_failed': {
      const reason = session.last_payment_error?.message ?? 'Payment failed';
      await transitionOrder(db, orderId, 'awaiting_payment', `Payment failed: ${reason}`);
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

async function isConfigured(db: LibSQLDatabase): Promise<boolean> {
  const key = await getSetting(db, 'stripe_secret_key');
  return !!key;
}

async function refund(
  _db: LibSQLDatabase,
  _order: PaymentOrder & { transaction_id: string | null },
  _amount: number,
  _reason: string,
): Promise<RefundResult> {
  return { success: false, error: 'Stripe refund not yet implemented' };
}

const stripeProvider: PaymentProvider = {
  name: 'stripe',
  refundable: true,
  initiatePayment,
  handleWebhook,
  isConfigured,
  refund,
};

// Auto-register on import
registerProvider(stripeProvider);

export { initiatePayment, handleWebhook };
export default stripeProvider;