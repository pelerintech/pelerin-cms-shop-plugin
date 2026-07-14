import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { orders } from '../../db/schema';
import { decryptIfNeeded } from '../../lib/crypto';
import { transitionOrder } from '../../lib/order-transitions';
import { getSetting, upsertSetting } from '../../lib/data/settings';
import { registerProvider } from './registry';
import { computeEuplatescHash, buildRequestFields, buildResponseFields, buildRefundFields, buildCheckMidFields } from '../../lib/euplatesc-mac';
import type {
  PaymentProvider,
  PaymentOrder,
  PaymentOptions,
  PaymentInitResult,
  WebhookResult,
  RefundResult,
} from './interface';

const EUPLATESC_ENDPOINT = 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php';

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

  const amount = (order.total / 100).toFixed(2); // bani → RON (minor → major units)
  const curr = order.currency;
  const invoiceId = order.order_number;
  const orderDesc = `Order ${order.order_number}`;
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const nonce = crypto.randomBytes(16).toString('hex');

  const fpHash = computeEuplatescHash(buildRequestFields({
    amount,
    curr,
    invoice_id: invoiceId,
    order_desc: orderDesc,
    merch_id: mid,
    timestamp,
    nonce,
  }), secretKey).toUpperCase();

  // Build redirect URL with query parameters
  const params = new URLSearchParams({
    amount,
    curr,
    invoice_id: invoiceId,
    order_desc: orderDesc,
    merch_id: mid,
    timestamp,
    nonce,
    fp_hash: fpHash,
  });

  // Billing fields
  const nameParts = order.customer_name.split(/\s+/, 2);
  params.set('fname', nameParts[0] || '');
  params.set('lname', nameParts[1] || '');
  params.set('email', order.customer_email);

  // ExtraData URLs (documented euPlatesc field names)
  params.set('ExtraData[silenturl]', options.webhook_url);
  params.set('ExtraData[successurl]', options.success_url);
  params.set('ExtraData[failedurl]', options.cancel_url);
  params.set('ExtraData[backtosite]', options.cancel_url);

  // Optional language preselect
  if (options.locale) {
    params.set('lang', options.locale);
  }

  const redirectUrl = `${EUPLATESC_ENDPOINT}?${params.toString()}`;

  // Update order payment fields
  await db
    .update(orders)
    .set({ payment_intent_id: invoiceId, payment_provider: 'euplatesc' })
    .where(sql`${orders.id} = ${order.id}`);

  // Transition order to awaiting_payment (skip if already awaiting_payment)
  if (order.status !== 'awaiting_payment') {
    await transitionOrder(db, order.id, 'awaiting_payment', 'Payment initiated via euPlatesc');
  }

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

  const invoiceId = (params.get('invoice_id') ?? '').trim();
  const epId = (params.get('ep_id') ?? '').trim();
  const action = (params.get('action') ?? '').trim();
  const message = (params.get('message') ?? '').trim();
  const receivedHash = params.get('fp_hash') ?? '';

  if (!invoiceId) {
    throw new Error('No invoice_id in euPlatesc IPN.');
  }

  // Build response params object for MAC computation
  const responseParams = {
    amount: (params.get('amount') ?? '').trim(),
    curr: (params.get('curr') ?? '').trim(),
    invoice_id: invoiceId,
    ep_id: epId,
    merch_id: (params.get('merch_id') ?? '').trim(),
    action,
    message,
    approval: (params.get('approval') ?? '').trim(),
    timestamp: (params.get('timestamp') ?? '').trim(),
    nonce: (params.get('nonce') ?? '').trim(),
    // Optional fields — buildResponseFields checks presence dynamically
    sec_status: params.get('sec_status') ?? undefined,
    rrn: params.get('rrn') ?? undefined,
    mcard: params.get('mcard') ?? undefined,
    card_exp: params.get('card_exp') ?? undefined,
    discount_amount: params.get('discount_amount') ?? undefined,
    card_type: params.get('card_type') ?? undefined,
    bin: params.get('bin') ?? undefined,
    rate: params.get('rate') ?? undefined,
    card_holder: params.get('card_holder') ?? undefined,
    email: params.get('email') ?? undefined,
    rtype: params.get('rtype') ?? undefined,
    cce: params.get('cce') ?? undefined,
  };

  // Verify HMAC using response field set
  const expectedHash = computeEuplatescHash(
    buildResponseFields(responseParams),
    secretKey,
  ).toUpperCase();

  const macValid = receivedHash.toUpperCase() === expectedHash;

  // Handle TEST- prefix (diagnostic test payment)
  if (invoiceId.startsWith('TEST-')) {
    await upsertSetting(db, 'euplatesc_test_result', JSON.stringify({
      timestamp: new Date().toISOString(),
      invoice_id: invoiceId,
      action,
      message,
      mac_valid: macValid,
      ep_id: epId,
      amount: responseParams.amount,
      curr: responseParams.curr,
    }));
    return { order_id: '', status: 'pending' };
  }

  // If MAC is invalid, return pending without transitioning (don't throw)
  if (!macValid) {
    console.warn(`[euPlatesc] Invalid HMAC signature for invoice ${invoiceId}`);
    return { order_id: '', status: 'pending' };
  }

  // Find order by order_number (= invoice_id)
  const orderResult = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(sql`${orders.order_number} = ${invoiceId}`)
    .limit(1);

  if (orderResult.length === 0) {
    console.warn(`[euPlatesc] Order not found for invoice: ${invoiceId}`);
    return { order_id: '', status: 'pending' };
  }

  const orderId = orderResult[0].id;
  const currentStatus = orderResult[0].status;

  // action = "0" means payment approved
  if (action === '0') {
    // Skip transition if already paid (idempotent)
    if (currentStatus !== 'paid') {
      await transitionOrder(db, orderId, 'paid', 'Payment confirmed via euPlatesc IPN');
    }
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

  // Payment failed — transition to awaiting_payment so it can be re-tried
  if (currentStatus === 'awaiting_payment') {
    // Already in awaiting_payment, no transition needed
    return { order_id: orderId, status: 'pending' };
  }

  return {
    order_id: orderId,
    status: 'pending',
  };
}

async function isConfigured(db: LibSQLDatabase): Promise<boolean> {
  const mid = await getSetting(db, 'euplatesc_merchant_id');
  const key = await getSetting(db, 'euplatesc_secret_key');
  return !!(mid && key);
}

async function refund(
  db: LibSQLDatabase,
  order: PaymentOrder & { transaction_id: string | null },
  amount: number,
  reason: string,
): Promise<RefundResult> {
  const ukey = await getSetting(db, 'euplatesc_ukey');
  const uapiKey = await getSetting(db, 'euplatesc_uapi_key');

  if (!ukey || !uapiKey) {
    return { success: false, error: 'euPlatesc refund credentials not configured' };
  }

  if (!order.transaction_id) {
    return { success: false, error: 'Cannot refund: no euPlatesc transaction ID on order' };
  }

  const decryptedUapiKey = decryptIfNeeded(uapiKey);
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const nonce = crypto.randomBytes(16).toString('hex');
  const amountRon = (amount / 100).toFixed(2); // bani → RON

  const fields = buildRefundFields({
    method: 'refund',
    ukey,
    amount: amountRon,
    reason,
    epid: order.transaction_id,
    timestamp,
    nonce,
  });

  const fpHash = computeEuplatescHash(fields, decryptedUapiKey).toUpperCase();

  const body = new URLSearchParams({
    method: 'refund',
    ukey,
    amount: amountRon,
    reason,
    epid: order.transaction_id,
    timestamp,
    nonce,
    fp_hash: fpHash,
  }).toString();

  try {
    const response = await fetch('https://manager.euplatesc.ro/v3/index.php?action=ws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = await response.json();

    if (data.success === '1') {
      return { success: true };
    }

    return { success: false, error: data.error || 'Unknown euPlatesc refund error' };
  } catch (err: any) {
    return { success: false, error: `euPlatesc refund request failed: ${err.message}` };
  }
}

const euplatescProvider: PaymentProvider = {
  name: 'euplatesc',
  refundable: true,
  initiatePayment,
  handleWebhook,
  isConfigured,
  refund,
};

// Auto-register on import
registerProvider(euplatescProvider);

export { initiatePayment, handleWebhook };
export default euplatescProvider;