import crypto from 'node:crypto';
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
} from './interface';

const EUPLATESC_ENDPOINT = 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php';

/**
 * Build the euPlatesc HMAC-MD5 signature.
 * euPlatesc uses: MD5 of concatenated raw bytes, uppercase hex.
 */
function buildEuplatescHmac(params: {
  amount: string;
  curr: string;
  invoice_id: string;
  order_desc: string;
  merch_id: string;
  timestamp: string;
  nonce: string;
  secretKey: string;
}): string {
  const data = [
    params.amount,
    params.curr,
    params.invoice_id,
    params.order_desc,
    params.merch_id,
    params.timestamp,
    params.nonce,
    params.secretKey,
  ].join('');

  return crypto.createHash('md5').update(data).digest('hex').toUpperCase();
}

async function initiatePayment(
  db: LibSQLDatabase,
  order: PaymentOrder,
  options: PaymentOptions,
): Promise<PaymentInitResult> {
  const midRaw = await getSetting(db, 'euplatesc_merchant_id');
  const secretKeyRaw = await getSetting(db, 'euplatesc_secret_key');

  if (!midRaw || !secretKeyRaw) {
    throw new Error('euPlatesc is not configured. Set euplatesc_merchant_id and euplatesc_secret_key in shop settings.');
  }

  const mid = decryptIfNeeded(midRaw);
  const secretKey = decryptIfNeeded(secretKeyRaw);

  const amount = order.total.toFixed(2);
  const curr = order.currency;
  const invoiceId = order.order_number;
  const orderDesc = `Order ${order.order_number}`;
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const nonce = crypto.randomBytes(16).toString('hex');

  const fpHash = buildEuplatescHmac({
    amount,
    curr,
    invoice_id: invoiceId,
    order_desc: orderDesc,
    merch_id: mid,
    timestamp,
    nonce,
    secretKey,
  });

  // Build redirect URL with query parameters
  const params = new URLSearchParams({
    mid,
    amount,
    curr,
    invoice_id: invoiceId,
    order_desc: orderDesc,
    merch_id: mid,
    timestamp,
    nonce,
    fp_hash: fpHash,
  });

  // Auto-redirect URLs
  const returnUrl = `${options.success_url}?order=${order.id}`;
  const backUrl = options.cancel_url;
  params.set('fname', '');
  params.set('lname', '');
  params.set('email', order.customer_email);
  params.set('ExtraData[return]', returnUrl);
  params.set('ExtraData[backUrl]', backUrl);

  const redirectUrl = `${EUPLATESC_ENDPOINT}?${params.toString()}`;

  // Update order payment_intent_id
  await db
    .update(orders)
    .set({ payment_intent_id: invoiceId })
    .where(sql`${orders.id} = ${order.id}`);

  // Transition order to awaiting_payment
  await transitionOrder(db, order.id, 'awaiting_payment', 'Payment initiated via euPlatesc');

  return {
    redirect_url: redirectUrl,
    provider_session_id: invoiceId,
  };
}

async function handleWebhook(db: LibSQLDatabase, request: Request): Promise<WebhookResult> {
  const secretKeyRaw = await getSetting(db, 'euplatesc_secret_key');
  if (!secretKeyRaw) {
    throw new Error('euPlatesc is not configured.');
  }

  const secretKey = decryptIfNeeded(secretKeyRaw);
  const body = await request.text();
  const params = new URLSearchParams(body);

  const epStatus = params.get('ep_status') ?? '';
  const invoiceId = params.get('invoice_id') ?? '';
  const epId = params.get('ep_id') ?? '';

  if (!invoiceId) {
    throw new Error('No invoice_id in euPlatesc IPN.');
  }

  // Find order by order_number (= invoice_id)
  const orderResult = await db
    .select({ id: orders.id })
    .from(orders)
    .where(sql`${orders.order_number} = ${invoiceId}`)
    .limit(1);
  if (orderResult.length === 0) {
    throw new Error(`Order not found for invoice: ${invoiceId}`);
  }

  const orderId = orderResult[0].id;

  // Verify HMAC
  const receivedHash = params.get('fp_hash') ?? '';
  const amount = params.get('amount') ?? '';
  const curr = params.get('curr') ?? '';
  const timestamp = params.get('timestamp') ?? '';
  const nonce = params.get('nonce') ?? '';
  const merchId = params.get('merch_id') ?? '';

  const expectedHash = buildEuplatescHmac({
    amount,
    curr,
    invoice_id: invoiceId,
    order_desc: `Order ${invoiceId}`,
    merch_id: merchId,
    timestamp,
    nonce,
    secretKey,
  });

  if (receivedHash.toUpperCase() !== expectedHash.toUpperCase()) {
    throw new Error('Invalid euPlatesc HMAC signature');
  }

  if (epStatus === 'authorized') {
    await transitionOrder(db, orderId, 'paid', 'Payment confirmed via euPlatesc IPN');
    await db
      .update(orders)
      .set({ transaction_id: epId })
      .where(sql`${orders.id} = ${orderId}`);
    return {
      order_id: orderId,
      status: 'paid',
      transaction_id: epId,
    };
  }

  return {
    order_id: orderId,
    status: 'pending',
  };
}

const euplatescProvider: PaymentProvider = {
  name: 'euplatesc',
  refundable: true,
  initiatePayment,
  handleWebhook,
};

// Auto-register on import
registerProvider(euplatescProvider);

export { initiatePayment, handleWebhook };
export default euplatescProvider;