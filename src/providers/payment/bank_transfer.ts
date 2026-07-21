/**
 * Bank Transfer — offline payment provider.
 *
 * Money moves outside the shop (customer transfers to the shop's bank account).
 * The admin reconciles manually when the statement arrives.
 *
 * isConfigured returns true when the admin has saved both beneficiary and IBAN.
 * initiatePayment / handleWebhook / refund are stubs — the flow never calls
 * them for offline providers.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
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

async function initiatePayment(
  _db: LibSQLDatabase,
  _order: PaymentOrder,
  _options: PaymentOptions
): Promise<PaymentInitResult> {
  // Offline provider — never called by the flow.
  return { redirect_url: '', provider_session_id: '' };
}

async function handleWebhook(_db: LibSQLDatabase, _request: Request): Promise<WebhookResult> {
  // Offline provider — no webhooks.
  return { order_id: '', status: 'pending' };
}

async function isConfigured(db: LibSQLDatabase): Promise<boolean> {
  const beneficiary = await getSetting(db, 'bank_transfer_beneficiary');
  const iban = await getSetting(db, 'bank_transfer_iban');
  return !!(beneficiary && iban);
}

async function refund(
  _db: LibSQLDatabase,
  _order: PaymentOrder & { transaction_id: string | null },
  _amount: number,
  _reason: string
): Promise<RefundResult> {
  throw new Error('bank_transfer is not refundable via the provider');
}

const bankTransferProvider: PaymentProvider = {
  name: 'bank_transfer',
  refundable: false,
  initiatePayment,
  handleWebhook,
  isConfigured,
  refund,
};

// Auto-register on import
registerProvider(bankTransferProvider);

export default bankTransferProvider;
