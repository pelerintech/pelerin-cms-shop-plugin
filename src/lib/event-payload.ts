import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getOrderWithItems } from './data/orders.ts';

/**
 * Build a self-contained order lifecycle event payload.
 *
 * Loads the complete order with items via `getOrderWithItems`, then constructs
 * a payload object shaped for downstream subscribers (email, analytics, etc.)
 * so they never need to query the shop database.
 *
 * Timestamps for `paid_at`, `shipped_at`, `cancelled_at` are derived from
 * `order_status_history` entries (the `created_at` of the transition to that
 * status). `refunded_at` is read from the order's `refunded_at` column.
 *
 * @param db      Drizzle database handle
 * @param orderId The order UUID
 * @param eventName  The event name (e.g. 'shop.order.confirmed', 'shop.order.paid')
 * @returns       A self-contained event payload
 * @throws        If the order is not found
 */
export async function buildOrderEventPayload(
  db: LibSQLDatabase,
  orderId: string,
  eventName: string
): Promise<OrderEventPayload> {
  const orderWithItems = await getOrderWithItems(db, orderId);
  if (!orderWithItems) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const { order, items, statusHistory } = orderWithItems;

  const payload: OrderEventPayload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    data: {
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        currency: order.currency,
        customer_email: order.customer_email,
        customer_name: order.customer_name,
        subtotal_net: order.subtotal_net,
        vat_total: order.vat_total,
        shipping_cost: order.shipping_cost,
        discount_amount: order.discount_amount,
        total: order.total,
        payment_provider: order.payment_provider,
        shipping_type: order.shipping_type,
        shipping_method: order.shipping_method,
        voucher_code: order.voucher_code,
        referral_code: order.referral_code,
        notes: order.notes,
        created_at: order.created_at ? order.created_at.toISOString() : null,
        updated_at: order.updated_at ? order.updated_at.toISOString() : null,
      },
      billing_address: {
        first_name: order.billing_first_name,
        last_name: order.billing_last_name,
        address: order.billing_address,
        city: order.billing_city,
        county: order.billing_county,
        postal_code: order.billing_postal_code,
        country: order.billing_country,
        company: order.billing_company,
        vat_number: order.billing_vat_number,
      },
      shipping_address: {
        first_name: order.shipping_first_name,
        last_name: order.shipping_last_name,
        address: order.shipping_address,
        city: order.shipping_city,
        county: order.shipping_county,
        postal_code: order.shipping_postal_code,
        country: order.shipping_country,
        company: order.shipping_company,
        vat_number: order.shipping_vat_number,
      },
      items: items.map((item: any) => ({
        product_name: item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        price_net: item.price_net,
        vat_rate: item.vat_rate,
        price_gross: item.price_gross,
        currency: item.currency,
      })),
    },
  };

  // Helper: find the timestamp of a status transition from status history
  function statusTransitionAt(status: string): string | null {
    const entry = statusHistory.find((h: any) => h.to_status === status);
    if (!entry || !entry.created_at) return null;
    return new Date(entry.created_at).toISOString();
  }

  // Status-specific enrichment fields derived from status history or order columns
  if (eventName === 'shop.order.paid') {
    payload.data.paid_at = statusTransitionAt('paid');
  }
  if (eventName === 'shop.order.shipped') {
    payload.data.shipped_at = statusTransitionAt('shipped');
  }
  if (eventName === 'shop.order.cancelled') {
    payload.data.cancelled_at = statusTransitionAt('cancelled');
  }
  if (eventName === 'shop.order.refunded') {
    payload.data.refund_amount = order.refund_amount ?? null;
    payload.data.refund_notes = order.refund_notes ?? null;
    payload.data.refunded_at = order.refunded_at ? new Date(order.refunded_at).toISOString() : null;
  }

  return payload;
}

export interface OrderEventPayload {
  event: string;
  timestamp: string;
  data: {
    order: Record<string, any>;
    billing_address: Record<string, any>;
    shipping_address: Record<string, any>;
    items: Array<Record<string, any>>;
    paid_at?: string | null;
    shipped_at?: string | null;
    cancelled_at?: string | null;
    refund_amount?: number | null;
    refund_notes?: string | null;
    refunded_at?: string | null;
  };
}
