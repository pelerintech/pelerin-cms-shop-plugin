/**
 * Data accessors for orders, order items, order status history, stock decrement,
 * and order-number generation.
 * Uses inArray/eq — never the sql IN-join idiom.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import {
  inArray,
  eq,
  and,
  isNull,
  ne,
  asc,
  desc,
  like,
  or,
  gte,
  lte,
  count,
  sql,
} from 'drizzle-orm';
import {
  orders,
  order_items,
  order_status_history,
  order_refunds,
  products,
  product_variants,
  carts,
  cart_items,
  shop_settings,
} from '../../db/schema.ts';
import { getSetting, getSettingBool, getSettingNumber, upsertSetting } from './settings.ts';

// ── Valid status transitions (state machine) ──
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['awaiting_payment', 'cancelled', 'processing'],
  awaiting_payment: ['paid', 'cancelled', 'pending'],
  paid: ['processing', 'cancelled', 'refund_requested'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'paid'],
  delivered: ['refund_requested', 'partially_refunded', 'refunded', 'paid'],
  partially_refunded: ['refunded', 'refund_requested'],
  refund_requested: ['refunded'],
  cancelled: [],
  refunded: [],
};

export class OrderTransitionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Thrown when an order item's requested quantity exceeds available stock (in-tx re-check). */
export class StockValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Thrown when a line-item refund violates the quantity invariant or status guard. */
export class RefundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Thrown when a restock line-item id does not belong to the order. */
export class RestockError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const OFFLINE_DEFERRED_TRANSITIONS = new Set([
  'pending->processing',
  'shipped->paid',
  'delivered->paid',
]);

export function validateTransition(
  fromStatus: string,
  toStatus: string,
  paymentProvider?: string | null
): void {
  if (fromStatus === toStatus) {
    throw new OrderTransitionError(`Cannot transition to the same status: ${fromStatus}`);
  }
  const allowed = VALID_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new OrderTransitionError(`Invalid status transition: ${fromStatus} → ${toStatus}`);
  }
  // Gate offline-deferred transitions to ramburs only
  const key = `${fromStatus}->${toStatus}`;
  if (OFFLINE_DEFERRED_TRANSITIONS.has(key) && paymentProvider !== 'ramburs') {
    throw new OrderTransitionError(
      `Transition ${fromStatus} → ${toStatus} is only allowed for ramburs orders`
    );
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

/** Create an order with snapshotted items, decrement stock, clear the source cart.
 *
 * Atomic: the order row, every order_items row, the initial status history row,
 * the per-item atomic stock decrement, and the cart clear/mark-converted all commit
 * inside a single `db.transaction()`. A failure at any step rolls back the entire
 * operation — no partial order, no orphaned stock change, no cleared cart.
 *
 * In-transaction stock re-validation: before decrementing, each item's stock is
 * re-checked against the requested quantity; insufficient stock throws
 * `StockValidationError` (mapped to a 409 by the caller) and the tx rolls back.
 *
 * Retry: wrapped in a ≤3-attempt loop; a UNIQUE-constraint violation on
 * `orders.order_number` (a concurrent commit landed the same sequence) triggers
 * a retry with a fresh `generateOrderNumber`. Non-unique errors propagate.
 */
export async function createOrder(
  db: LibSQLDatabase,
  input: CreateOrderInput
): Promise<{ id: string; order_number: string; status: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    // Generate the order number OUTSIDE the tx (reads/writes shop_settings);
    // the UNIQUE constraint + retry defends against collisions. The sequence
    // read-modify-write is serialized by the tx that sets it.
    const orderNumber = await generateOrderNumber(db);
    try {
      const result = await db.transaction(async (tx) => {
        const now = new Date();
        const orderId = crypto.randomUUID();

        await tx.insert(orders).values({
          id: orderId,
          order_number: orderNumber,
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
          await tx.insert(order_items).values({
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
        await tx.insert(order_status_history).values({
          id: crypto.randomUUID(),
          order_id: orderId,
          from_status: null,
          to_status: 'pending',
          note: null,
          changed_by: null,
          created_at: now,
        });

        // In-transaction stock re-validation + atomic decrement (single UPDATE per item).
        await decrementStock(tx, orderId);

        // Clear the source cart (if provided)
        if (input.cart_id) {
          await tx.delete(cart_items).where(eq(cart_items.cart_id, input.cart_id));
          await tx.update(carts).set({ converted_at: now }).where(eq(carts.id, input.cart_id));
        }

        return { id: orderId, order_number: orderNumber, status: 'pending' };
      });
      return result;
    } catch (err: any) {
      lastErr = err;
      // Retry only on a UNIQUE-constraint violation on orders.order_number.
      const msg = String(err?.message ?? '');
      const isUniqueViolation =
        /UNIQUE constraint failed: orders\.order_number/i.test(msg) ||
        /SQLITE_CONSTRAINT_UNIQUE/i.test(String(err?.code ?? ''));
      if (!isUniqueViolation) throw err;
      // else: loop and retry with a fresh generateOrderNumber
    }
  }
  throw lastErr;
}

export interface OrderWithItems {
  order: any;
  items: any[];
  statusHistory: any[];
}

/** Get an order with its items and status history. */
export async function getOrderWithItems(
  db: LibSQLDatabase,
  orderId: string
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
  changedBy?: string | null
): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OrderTransitionError(`Order not found: ${orderId}`);

  const fromStatus = order.status;
  const now = new Date();

  if (fromStatus === toStatus) {
    await db.insert(order_status_history).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      from_status: fromStatus,
      to_status: toStatus,
      note: note ?? null,
      changed_by: changedBy ?? null,
      created_at: now,
    });
    return;
  }

  validateTransition(fromStatus, toStatus, order.payment_provider);

  await db.update(orders).set({ status: toStatus, updated_at: now }).where(eq(orders.id, orderId));
  await db.insert(order_status_history).values({
    id: crypto.randomUUID(),
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    note: note ?? null,
    changed_by: changedBy ?? null,
    created_at: now,
  });
}

/** Decrement stock for all line items in an order (skips null stock, never below 0).
 *
 * Atomic: a single `UPDATE ... SET stock = MAX(0, stock - ?) WHERE id = ?` per item —
 * NO preceding SELECT of the variant/product stock. Runs inside the caller's
 * transaction (receives `tx`). Before decrementing, re-validates that sufficient
 * stock exists and throws `StockValidationError` if not (the MAX(0,...) floor is
 * a backstop only, never the enforcement).
 */
export async function decrementStock(db: LibSQLDatabase, orderId: string): Promise<void> {
  const items = await db.select().from(order_items).where(eq(order_items.order_id, orderId));

  for (const item of items) {
    if (item.variant_id) {
      // Atomic conditional UPDATE: only decrements when stock IS NOT NULL AND >= qty.
      // No preceding SELECT. Uses raw SQL with literal table/column names.
      const result = await db.run(
        sql.raw(
          `UPDATE "product_variants" SET "stock" = MAX(0, "stock" - ${item.quantity}) ` +
            `WHERE "id" = '${item.variant_id.replace(/'/g, "''")}' ` +
            `AND "stock" IS NOT NULL AND "stock" >= ${item.quantity}`
        )
      );
      if (result.rowsAffected === 0) {
        // Determine why: null stock (skip, ok) vs insufficient (throw) vs missing (skip).
        const [v] = await db
          .select()
          .from(product_variants)
          .where(eq(product_variants.id, item.variant_id));
        if (v && v.stock !== null && v.stock < item.quantity) {
          throw new StockValidationError(
            `Insufficient stock for variant ${item.variant_id}: have ${v.stock}, need ${item.quantity}`
          );
        }
        // null stock or missing row → skip (best-effort, as today)
      }
    } else if (item.product_id) {
      const result = await db.run(
        sql.raw(
          `UPDATE "products" SET "stock" = MAX(0, "stock" - ${item.quantity}) ` +
            `WHERE "id" = '${item.product_id.replace(/'/g, "''")}' ` +
            `AND "stock" IS NOT NULL AND "stock" >= ${item.quantity}`
        )
      );
      if (result.rowsAffected === 0) {
        const [p] = await db.select().from(products).where(eq(products.id, item.product_id));
        if (p && p.stock !== null && p.stock < item.quantity) {
          throw new StockValidationError(
            `Insufficient stock for product ${item.product_id}: have ${p.stock}, need ${item.quantity}`
          );
        }
      }
    }
  }
}

export interface RestockLineItem {
  order_item_id: string;
  quantity: number;
}

/** Restore stock for an order's line items.
 *
 * - **Full mode** (`items` omitted): restocks ALL line items by their ordered quantity.
 *   Used by the cancel path (full rollback of the creation-time decrement).
 * - **Line-item mode** (`items: [{ order_item_id, quantity }]`): restocks only the named
 *   items' quantities. Used by the refund path. Each `order_item_id` must belong to the
 *   order or `RestockError` is thrown.
 *
 * Uses the atomic additive `UPDATE ... SET stock = stock + ? WHERE id = ?` (no read-then-write).
 * Skips items whose product_id/variant_id is null or whose entity is missing (best-effort).
 * Runs on the provided `db` handle (the caller's transaction `tx` when invoked inside one).
 */
export async function restockOrderItems(
  db: LibSQLDatabase,
  orderId: string,
  items?: RestockLineItem[]
): Promise<void> {
  const orderItems = await db.select().from(order_items).where(eq(order_items.order_id, orderId));
  const byId = new Map(orderItems.map((oi) => [oi.id, oi]));

  // Determine which (order_item_id, quantity) pairs to restock.
  let lines: RestockLineItem[];
  if (items && items.length > 0) {
    // Line-item mode: validate each belongs to the order.
    for (const line of items) {
      if (!byId.has(line.order_item_id)) {
        throw new RestockError(
          `order_item ${line.order_item_id} does not belong to order ${orderId}`
        );
      }
    }
    lines = items;
  } else {
    // Full mode: restock every line item by its ordered quantity.
    lines = orderItems.map((oi) => ({ order_item_id: oi.id, quantity: oi.quantity }));
  }

  for (const line of lines) {
    const oi = byId.get(line.order_item_id)!;
    if (oi.variant_id) {
      // Atomic additive UPDATE; no preceding read. Skips null-stock/missing rows silently.
      await db.run(
        sql.raw(
          `UPDATE "product_variants" SET "stock" = "stock" + ${line.quantity} ` +
            `WHERE "id" = '${oi.variant_id.replace(/'/g, "''")}' AND "stock" IS NOT NULL`
        )
      );
    } else if (oi.product_id) {
      await db.run(
        sql.raw(
          `UPDATE "products" SET "stock" = "stock" + ${line.quantity} ` +
            `WHERE "id" = '${oi.product_id.replace(/'/g, "''")}' AND "stock" IS NOT NULL`
        )
      );
    }
    // else: both null → skip (digital/unknown), no error.
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
  opts: ListOrdersOptions = {}
): Promise<ListOrdersResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const sortCol = SORT_COL_MAP[opts.sort ?? 'created_at'] ?? orders.created_at;
  const orderDir = opts.dir === 'asc' ? asc : desc;

  // Build the WHERE clause in SQL (r17 Task 9) — no full-table load into Node.
  const conditions: any[] = [];
  if (opts.status && opts.status.length > 0) {
    conditions.push(inArray(orders.status, opts.status));
  }
  if (opts.from) {
    conditions.push(gte(orders.created_at, new Date(opts.from)));
  }
  if (opts.to) {
    // Date-range off-by-one fix: a date-only `to` (no 'T') is treated as the end
    // of that day so same-day orders are included.
    let toStr = opts.to;
    if (!/T/.test(toStr)) toStr = toStr + 'T23:59:59.999Z';
    conditions.push(lte(orders.created_at, new Date(toStr)));
  }
  if (opts.search) {
    const s = `%${opts.search.toLowerCase()}%`;
    conditions.push(
      or(
        like(orders.order_number, s),
        like(orders.customer_name, s),
        like(orders.customer_email, s)
      )
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Total via a separate COUNT with the same WHERE.
  const [countRow] = await db.select({ value: count() }).from(orders).where(where);
  const total = countRow?.value ?? 0;

  // Page via SQL ORDER BY + LIMIT + OFFSET.
  const paged = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(orderDir(sortCol))
    .limit(limit)
    .offset((page - 1) * limit);

  return { orders: paged, total, page, limit };
}

/** Record a refund on an order (sets refund_amount, refund_notes, refunded_at). */
export async function recordOrderRefund(
  db: LibSQLDatabase,
  orderId: string,
  refundAmount: number,
  refundNotes: string | null
): Promise<void> {
  await db
    .update(orders)
    .set({
      refund_amount: refundAmount,
      refund_notes: refundNotes,
      refunded_at: new Date(),
    })
    .where(eq(orders.id, orderId));
}

export interface LineItemRefundLine {
  order_item_id: string;
  quantity: number;
  amount?: number | null;
  notes?: string | null;
}

export interface LineItemRefundInput {
  refunds: LineItemRefundLine[];
  notes?: string | null;
}

/** Record a line-item-granular, quantity-aware refund (r16).
 *
 * Validate-before-write, all inside one transaction:
 *  1. Load order + items + existing order_refunds.
 *  2. Guard status ∈ {delivered, partially_refunded} (else RefundError) — BEFORE any write.
 *  3. For each refund line: validate order_item_id belongs to the order, and
 *     quantity ≤ (item.quantity − sum of existing refund quantities for that item).
 *  4. Insert order_refunds rows, restock the refunded quantities, update the
 *     order-level summary (refund_amount running total, refund_notes, refunded_at),
 *     and transition to `refunded` (if every item now fully refunded) else
 *     `partially_refunded`.
 */
export async function recordLineItemRefund(
  db: LibSQLDatabase,
  orderId: string,
  input: LineItemRefundInput,
  changedBy?: string | null
): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw new RefundError(`Order not found: ${orderId}`);

    // Validate-before-write: status guard.
    if (order.status !== 'delivered' && order.status !== 'partially_refunded') {
      throw new RefundError(`Order in status '${order.status}' is not refundable`);
    }

    const orderItems = await tx.select().from(order_items).where(eq(order_items.order_id, orderId));
    const itemById = new Map(orderItems.map((oi) => [oi.id, oi]));

    const existingRefunds = await tx
      .select()
      .from(order_refunds)
      .where(eq(order_refunds.order_id, orderId));
    const refundedByItem = new Map<string, number>();
    for (const r of existingRefunds) {
      refundedByItem.set(r.order_item_id, (refundedByItem.get(r.order_item_id) ?? 0) + r.quantity);
    }

    // Validate each refund line (before any write).
    for (const line of input.refunds) {
      const item = itemById.get(line.order_item_id);
      if (!item) {
        throw new RefundError(
          `order_item ${line.order_item_id} does not belong to order ${orderId}`
        );
      }
      const already = refundedByItem.get(line.order_item_id) ?? 0;
      const remaining = item.quantity - already;
      if (line.quantity > item.quantity) {
        throw new RefundError(
          `refund quantity ${line.quantity} exceeds item quantity ${item.quantity}`
        );
      }
      if (line.quantity > remaining) {
        throw new RefundError(`refund quantity ${line.quantity} exceeds remaining ${remaining}`);
      }
    }

    // Insert order_refunds rows + accumulate per-item refunded totals.
    const newRefundedByItem = new Map(refundedByItem);
    let amountDelta = 0;
    for (const line of input.refunds) {
      await tx.insert(order_refunds).values({
        id: crypto.randomUUID(),
        order_id: orderId,
        order_item_id: line.order_item_id,
        quantity: line.quantity,
        amount: line.amount ?? null,
        notes: line.notes ?? null,
        created_at: now,
        created_by: changedBy ?? null,
      });
      newRefundedByItem.set(
        line.order_item_id,
        (newRefundedByItem.get(line.order_item_id) ?? 0) + line.quantity
      );
      if (line.amount != null) amountDelta += line.amount;
    }

    // Restock the refunded quantities (line-item mode).
    await restockOrderItems(
      tx,
      orderId,
      input.refunds.map((l) => ({ order_item_id: l.order_item_id, quantity: l.quantity }))
    );

    // Update order-level summary (running total).
    const newRefundAmount = (order.refund_amount ?? 0) + amountDelta;
    const notes = input.notes ?? order.refund_notes ?? null;

    // Determine terminal status: refunded iff every item is now fully refunded.
    const allFullyRefunded = orderItems.every(
      (oi) => (newRefundedByItem.get(oi.id) ?? 0) >= oi.quantity
    );
    const newStatus = allFullyRefunded ? 'refunded' : 'partially_refunded';

    await tx
      .update(orders)
      .set({
        refund_amount: newRefundAmount,
        refund_notes: notes,
        refunded_at: now,
        updated_at: now,
      })
      .where(eq(orders.id, orderId));

    await transitionOrderStatus(
      tx,
      orderId,
      newStatus,
      input.notes ?? 'Line-item refund recorded',
      changedBy ?? null
    );
  });
}

// ── Order number generation ──

/** Generate the next sequential order number using configured prefix/year/padding. */
export async function generateOrderNumber(db: LibSQLDatabase): Promise<string> {
  const prefix = (await getSetting(db, 'order_number_prefix')) ?? 'ORD';
  const includeYear = (await getSettingBool(db, 'order_number_year')) ?? false;
  const padding = (await getSettingNumber(db, 'order_number_padding')) ?? 5;

  const current = (await getSettingNumber(db, 'order_number_sequence')) ?? 0;
  const next = current + 1;
  await upsertSetting(db, 'order_number_sequence', String(next));

  const year = includeYear ? `-${new Date().getFullYear()}` : '';
  const seq = String(next).padStart(padding, '0');
  return includeYear ? `${prefix}${year}-${seq}` : `${prefix}-${seq}`;
}
