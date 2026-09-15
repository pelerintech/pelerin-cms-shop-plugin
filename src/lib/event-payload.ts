import type { AnyRecord } from './types.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray } from 'drizzle-orm';
import { getOrderWithItems } from './data/orders.ts';
import { products, product_variants } from '../db/schema.ts';

/**
 * Parse an order's `metadata` (stored as a JSON string) into an object so
 * downstream subscribers can traverse it (e.g. `data.order.metadata.pickup_location`).
 * Returns null for null/undefined input or malformed JSON. The metadata blob is
 * generic — ecomm does not interpret its contents; it only makes it traversable.
 */
function parseMetadata(metadata: string | null | undefined): unknown {
  if (metadata == null || metadata === '') return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

/**
 * Build the order lifecycle event DATA object (not the bus envelope).
 *
 * Loads the complete order with items via `getOrderWithItems`, then constructs
 * a data object shaped for downstream subscribers (email, analytics, etc.)
 * so they never need to query the shop database. The CMS event bus wraps the
 * returned value into `{ event, timestamp, data }`, so this helper deliberately
 * returns ONLY the `data` object (no `event`/`timestamp` — the bus supplies those).
 *
 * Timestamps for `paid_at`, `shipped_at`, `cancelled_at` are derived from
 * `order_status_history` entries (the `created_at` of the transition to that
 * status). `refunded_at` is read from the order's `refunded_at` column.
 *
 * @param db      Drizzle database handle
 * @param orderId The order UUID
 * @param eventName  The event name (e.g. 'shop.order.confirmed', 'shop.order.paid')
 * @returns       The event-specific data object
 * @throws        If the order is not found
 */
export async function buildOrderEventData(
  db: LibSQLDatabase,
  orderId: string,
  eventName: string
): Promise<OrderEventData> {
  const orderWithItems = await getOrderWithItems(db, orderId);
  if (!orderWithItems) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const { order, items, statusHistory } = orderWithItems;

  // Resolve each line item's product slug so downstream subscribers (e.g. the
  // notifications plugin) can build per-product guide URLs. Variants don't carry
  // their own slug, so a variant item falls back to its parent product's slug.
  const productIds = new Set<string>();
  const variantIds = new Set<string>();
  for (const item of items) {
    if (item.product_id) productIds.add(item.product_id);
    if (item.variant_id) variantIds.add(item.variant_id);
  }

  const slugByProduct = new Map<string, string>();
  const productIdByVariant = new Map<string, string>();
  if (productIds.size > 0) {
    const rows = await db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(inArray(products.id, [...productIds]));
    for (const p of rows) slugByProduct.set(p.id, p.slug);
  }
  if (variantIds.size > 0) {
    const vrows = await db
      .select({ id: product_variants.id, product_id: product_variants.product_id })
      .from(product_variants)
      .where(inArray(product_variants.id, [...variantIds]));
    for (const v of vrows) productIdByVariant.set(v.id, v.product_id);
    // Fetch slugs for variant parent products not already loaded.
    const missing = [...new Set(vrows.map((v) => v.product_id))].filter(
      (pid) => !slugByProduct.has(pid)
    );
    if (missing.length > 0) {
      const prows = await db
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .where(inArray(products.id, missing));
      for (const p of prows) slugByProduct.set(p.id, p.slug);
    }
  }
  function slugForItem(item: (typeof items)[number]): string | null {
    const productId =
      item.product_id ?? (item.variant_id ? productIdByVariant.get(item.variant_id) : null);
    if (!productId) return null;
    return slugByProduct.get(productId) ?? null;
  }

  const payload: OrderEventData = {
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
      user_id: order.user_id ?? null,
      metadata: parseMetadata(order.metadata),
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
    items: items.map((item) => ({
      product_name: item.product_name,
      sku: item.sku,
      slug: slugForItem(item),
      quantity: item.quantity,
      price_net: item.price_net,
      vat_rate: item.vat_rate,
      price_gross: item.price_gross,
      currency: item.currency,
    })),
  };

  // Helper: find the timestamp of a status transition from status history
  function statusTransitionAt(status: string): string | null {
    const entry = statusHistory.find((h) => h.to_status === status);
    if (!entry || !entry.created_at) return null;
    return new Date(entry.created_at).toISOString();
  }

  // Status-specific enrichment fields derived from status history or order columns
  if (eventName === 'shop.order.paid') {
    payload.paid_at = statusTransitionAt('paid');
  }
  if (eventName === 'shop.order.shipped') {
    payload.shipped_at = statusTransitionAt('shipped');
  }
  if (eventName === 'shop.order.cancelled') {
    payload.cancelled_at = statusTransitionAt('cancelled');
  }
  if (eventName === 'shop.order.refunded') {
    payload.refund_amount = order.refund_amount ?? null;
    payload.refund_notes = order.refund_notes ?? null;
    payload.refunded_at = order.refunded_at ? new Date(order.refunded_at).toISOString() : null;
  }

  return payload;
}

export interface OrderEventData {
  order: AnyRecord;
  billing_address: AnyRecord;
  shipping_address: AnyRecord;
  items: Array<AnyRecord>;
  paid_at?: string | null;
  shipped_at?: string | null;
  cancelled_at?: string | null;
  refund_amount?: number | null;
  refund_notes?: string | null;
  refunded_at?: string | null;
}
