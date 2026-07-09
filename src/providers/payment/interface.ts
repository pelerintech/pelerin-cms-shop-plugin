/**
 * Payment provider interface — the contract every payment adapter must implement.
 * Providers are swappable via shop_settings; new providers can be added
 * without modifying core shop logic.
 */

import type { OrderStatus } from '../../schemas/enums';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

/** Subset of order fields needed by payment providers */
export interface PaymentOrder {
  id: string;
  order_number: string;
  currency: string;
  total: number;
  customer_email: string;
  customer_name: string;
  status: OrderStatus;
}

/** Options passed to initiatePayment — set by the checkout flow */
export interface PaymentOptions {
  success_url: string;
  cancel_url: string;
  currency: string;
  locale?: string;
}

/** Return value from a successful payment initiation */
export interface PaymentInitResult {
  redirect_url: string;
  provider_session_id: string;
}

/** Return value from webhook/handler processing */
export interface WebhookResult {
  order_id: string;
  status: 'paid' | 'failed' | 'pending';
  transaction_id?: string;
  error?: string;
}

/** Every payment provider must implement this interface */
export interface PaymentProvider {
  readonly name: string;
  readonly refundable: boolean;
  initiatePayment(db: LibSQLDatabase, order: PaymentOrder, options: PaymentOptions): Promise<PaymentInitResult>;
  handleWebhook(db: LibSQLDatabase, request: Request): Promise<WebhookResult>;
}
