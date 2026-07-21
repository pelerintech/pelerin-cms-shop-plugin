/**
 * Ramburs — offline payment provider for cash/card on delivery or pickup.
 *
 * The customer pays the courier or at pickup; the shop receives confirmation
 * after fulfillment. No third-party integration needed.
 *
 * isConfigured reads the ramburs_enabled toggle (default true).
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
  const enabled = await getSetting(db, 'ramburs_enabled');
  // Default true: absent setting means enabled
  return enabled !== 'false';
}

async function refund(
  _db: LibSQLDatabase,
  _order: PaymentOrder & { transaction_id: string | null },
  _amount: number,
  _reason: string
): Promise<RefundResult> {
  throw new Error('ramburs is not refundable via the provider');
}

const rambursProvider: PaymentProvider = {
  name: 'ramburs',
  refundable: false,
  initiatePayment,
  handleWebhook,
  isConfigured,
  refund,
};

// Auto-register on import
registerProvider(rambursProvider);

export default rambursProvider;
