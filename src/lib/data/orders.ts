/**
 * Data accessors for orders, order items, order status history, stock decrement,
 * and order-number generation.
 * Uses inArray/eq — never the sql IN-join idiom.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, eq, and, isNull, ne, asc, desc, like, or, gte, lte, count } from 'drizzle-orm';
import {
  orders,
  order_items,
  order_status_history,
  products,
  product_variants,
  carts,
  cart_items,
  shop_settings,
} from '../../db/schema.ts';

// ── Valid status transitions (state machine) ──
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled', 'refund_requested'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['refund_requested'],
  refund_requested: ['refunded'],
  cancelled: [],
  refunded: [],
};

export class OrderTransitionError extends Error {
  constructor(message: string) { super(message); }
}

export function validateTransition(fromStatus: string, toStatus: string): void {
  if (fromStatus === toStatus) {
    throw new OrderTransitionError(`Cannot transition to the same status: ${fromStatus}`);
  }
  const allowed = VALID_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new OrderTransitionError(`Invalid status transition: ${fromStatus} → ${toStatus}`);
  }
}

// ── Order CRUD ──

export interface CreateOrderItemInput {
  product_id?: string | null;
  variant_id?: string | null;
  product_name: string;
  sku?: string | null;
  quantity: number;
  price_net: number;
  vat_rate?: number | null;
  price_gross: number;
  currency: string;
}

export interface CreateOrderInput {
  order_number: string;
  user_id?: string | null;
  customer_type: string;
  customer_email: string;
  customer_name: string;
  customer_phone?: string | null;
  currency: string;
  subtotal_net: number;
  vat_total: number;
  shipping_cost: number;
  discount_amount: number;
  total: number;
  shipping_type: string;
  shipping_method?: string | null;
  voucher_code?: string | null;
  referral_code?: string | null;
  billing_first_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_address_extra?: string | null;
  billing_city: string;
  billing_postal_code: string;
  billing_country: string;
  billing_county?: string | null;
  billing_phone?: string | null;
  billing_company?: string | null;
  billing_vat_number?: string | null;
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_address: string;
  shipping_address_extra?: string | null;
  shipping_city: string;
  shipping_postal_code: string;
  shipping_country: string;
  shipping_county?: string | null;
  shipping_phone?: string | null;
  shipping_company?: string | null;
  shipping_vat_number?: string | null;
  shipping_same_as_billing: boolean;
  payment_provider?: string | null;
  notes?: string | null;
  cart_id?: string | null;
  items: CreateOrderItemInput[];
}

/** Create an order with snapshotted items, decrement stock, clear the source cart. */
export async function createOrder(
  db: LibSQLDatabase,
  input: CreateOrderInput,
): Promise<{ id: string; order_number: string; status: string }> {
  const now = new Date();
  const orderId = crypto.randomUUID();

  await db.insert(orders).values({
    id: orderId,
    order_number: input.order_number,
    user_id: input.user_id ?? null,
    customer_type: input.customer_type,
    customer_email: input.customer_email,
    customer_name: input.customer_name,
    customer_phone: input.customer_phone ?? null,
    status: 'pending',
    currency: input.currency,
    subtotal_net: input.subtotal_net,
    vat_total: input.vat_total,
    shipping_cost: input.shipping_cost,
    discount_amount: input.discount_amount,
    total: input.total,
    shipping_type: input.shipping_type,
    shipping_method: input.shipping_method ?? null,
    voucher_code: input.voucher_code ?? null,
    referral_code: input.referral_code ?? null,
    billing_first_name: input.billing_first_name,
    billing_last_name: input.billing_last_name,
    billing_address: input.billing_address,
    billing_address_extra: input.billing_address_extra ?? null,
    billing_city: input.billing_city,
    billing_postal_code: input.billing_postal_code,
    billing_country: input.billing_country,
    billing_county: input.billing_county ?? null,
    billing_phone: input.billing_phone ?? null,
    billing_company: input.billing_company ?? null,
    billing_vat_number: input.billing_vat_number ?? null,
    shipping_first_name: input.shipping_first_name,
    shipping_last_name: input.shipping_last_name,
    shipping_address: input.shipping_address,
    shipping_address_extra: input.shipping_address_extra ?? null,
    shipping_city: input.shipping_city,
    shipping_postal_code: input.shipping_postal_code,
    shipping_country: input.shipping_country,
    shipping_county: input.shipping_county ?? null,
    shipping_phone: input.shipping_phone ?? null,
    shipping_company: input.shipping_company ?? null,
    shipping_vat_number: input.shipping_vat_number ?? null,
    shipping_same_as_billing: input.shipping_same_as_billing,
    payment_provider: input.payment_provider ?? null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  });

  // Insert order items (snapshot)
  for (const item of input.items) {
    await db.insert(order_items).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      product_id: item.product_id ?? null,
      variant_id: item.variant_id ?? null,
      product_name: item.product_name,
      sku: item.sku ?? null,
      quantity: item.quantity,
      price_net: item.price_net,
      vat_rate: item.vat_rate ?? null,
      price_gross: item.price_gross,
      currency: item.currency,
    });
  }

  // Insert initial status history
  await db.insert(order_status_history).values({
    id: crypto.randomUUID(),
    order_id: orderId,
    from_status: null,
    to_status: 'pending',
    note: null,
    changed_by: null,
    created_at: now,
  });

  // Decrement stock
  await decrementStock(db, orderId);

  // Clear the source cart (if provided)
  if (input.cart_id) {
    await db.delete(cart_items).where(eq(cart_items.cart_id, input.cart_id));
    await db.update(carts).set({ converted_at: now }).where(eq(carts.id, input.cart_id));
  }

  return { id: orderId, order_number: input.order_number, status: 'pending' };
}

export interface OrderWithItems {
  order: any;
  items: any[];
  statusHistory: any[];
}

/** Get an order with its items and status history. */
export async function getOrderWithItems(
  db: LibSQLDatabase,
  orderId: string,
): Promise<OrderWithItems | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;

  const items = await db.select().from(order_items).where(eq(order_items.order_id, orderId));
  const history = await db
    .select()
    .from(order_status_history)
    .where(eq(order_status_history.order_id, orderId))
    .orderBy(asc(order_status_history.created_at));

  return { order, items, statusHistory: history };
}

/** Transition an order to a new status (state-machine validated). Same-status logs history only. */
export async function transitionOrderStatus(
  db: LibSQLDatabase,
  orderId: string,
  toStatus: string,
  note?: string | null,
  changedBy?: string | null,
): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OrderTransitionError(`Order not found: ${orderId}`);

  const fromStatus = order.status;
  const now = new Date();

  if (fromStatus === toStatus) {
    await db.insert(order_status_history).values({
      id: crypto.randomUUID(), order_id: orderId, from_status: fromStatus, to_status: toStatus,
      note: note ?? null, changed_by: changedBy ?? null, created_at: now,
    });
    return;
  }

  validateTransition(fromStatus, toStatus);

  await db.update(orders).set({ status: toStatus, updated_at: now }).where(eq(orders.id, orderId));
  await db.insert(order_status_history).values({
    id: crypto.randomUUID(), order_id: orderId, from_status: fromStatus, to_status: toStatus,
    note: note ?? null, changed_by: changedBy ?? null, created_at: now,
  });
}

/** Decrement stock for all line items in an order (skips null stock, never below 0). */
export async function decrementStock(
  db: LibSQLDatabase,
  orderId: string,
): Promise<void> {
  const items = await db.select().from(order_items).where(eq(order_items.order_id, orderId));

  for (const item of items) {
    if (item.variant_id) {
      const [variant] = await db.select().from(product_variants).where(eq(product_variants.id, item.variant_id));
      if (variant && variant.stock !== null) {
        const newStock = Math.max(0, variant.stock - item.quantity);
        await db.update(product_variants).set({ stock: newStock }).where(eq(product_variants.id, item.variant_id));
      }
    } else if (item.product_id) {
      const [product] = await db.select().from(products).where(eq(products.id, item.product_id));
      if (product && product.stock !== null) {
        const newStock = Math.max(0, product.stock - item.quantity);
        await db.update(products).set({ stock: newStock }).where(eq(products.id, item.product_id));
      }
    }
  }
}

// ── List orders with filters + pagination ──

export interface ListOrdersOptions {
  page?: number;
  limit?: number;
  status?: string[];
  from?: string;
  to?: string;
  search?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
}

export interface ListOrdersResult {
  orders: any[];
  total: number;
  page: number;
  limit: number;
}

const SORT_COL_MAP: Record<string, any> = {
  created_at: orders.created_at,
  updated_at: orders.updated_at,
  order_number: orders.order_number,
  total: orders.total,
  status: orders.status,
};

/** List orders with filters, search, and pagination. Ordered by created_at DESC by default. */
export async function listOrders(
  db: LibSQLDatabase,
  opts: ListOrdersOptions = {},
): Promise<ListOrdersResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const sortCol = SORT_COL_MAP[opts.sort ?? 'created_at'] ?? orders.created_at;
  const orderDir = opts.dir === 'asc' ? asc : desc;

  // Fetch all then filter in memory (small dataset; avoids dynamic WHERE complexity)
  let rows = await db.select().from(orders);

  if (opts.status && opts.status.length > 0) {
    rows = rows.filter(o => opts.status!.includes(o.status));
  }
  if (opts.from) {
    const fromD = new Date(opts.from);
    rows = rows.filter(o => o.created_at >= fromD);
  }
  if (opts.to) {
    const toD = new Date(opts.to);
    rows = rows.filter(o => o.created_at <= toD);
  }
  if (opts.search) {
    const s = opts.search.toLowerCase();
    rows = rows.filter(o =>
      (o.order_number && o.order_number.toLowerCase().includes(s)) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(s)) ||
      (o.customer_email && o.customer_email.toLowerCase().includes(s)),
    );
  }

  // Sort
  rows.sort((a, b) => {
    const av = a[opts.sort ?? 'created_at'];
    const bv = b[opts.sort ?? 'created_at'];
    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return opts.dir === 'asc' ? cmp : -cmp;
  });

  const total = rows.length;
  const paged = rows.slice((page - 1) * limit, page * limit);

  return { orders: paged, total, page, limit };
}

/** Record a refund on an order (sets refund_amount, refund_notes, refunded_at). */
export async function recordOrderRefund(
  db: LibSQLDatabase,
  orderId: string,
  refundAmount: number,
  refundNotes: string | null,
): Promise<void> {
  await db.update(orders).set({
    refund_amount: refundAmount,
    refund_notes: refundNotes,
    refunded_at: new Date(),
  }).where(eq(orders.id, orderId));
}

// ── Order number generation ──

async function getSetting(db: LibSQLDatabase, key: string): Promise<string | null> {
  const [row] = await db.select().from(shop_settings).where(eq(shop_settings.key, key));
  return row?.value ?? null;
}

async function setSetting(db: LibSQLDatabase, key: string, value: string): Promise<void> {
  const [existing] = await db.select().from(shop_settings).where(eq(shop_settings.key, key));
  if (existing) {
    await db.update(shop_settings).set({ value }).where(eq(shop_settings.id, existing.id));
  } else {
    await db.insert(shop_settings).values({ id: crypto.randomUUID(), key, value });
  }
}

/** Generate the next sequential order number using configured prefix/year/padding. */
export async function generateOrderNumber(db: LibSQLDatabase): Promise<string> {
  const prefix = (await getSetting(db, 'order_number_prefix')) ?? 'ORD';
  const includeYear = (await getSetting(db, 'order_number_year')) !== 'false';
  const padding = parseInt((await getSetting(db, 'order_number_padding')) ?? '5');

  const current = parseInt((await getSetting(db, 'order_number_sequence')) ?? '0');
  const next = current + 1;
  await setSetting(db, 'order_number_sequence', String(next));

  const year = includeYear ? `-${new Date().getFullYear()}` : '';
  const seq = String(next).padStart(padding, '0');
  return `${prefix}${year}-${seq}`;
}
