import { db, orders, order_status_history, sql as dbSql } from 'astro:db';
import { decrementStock } from './stock-decrement.ts';
import { clearCartForOrder } from './cart-clear.ts';

/**
 * Valid status transitions for orders.
 * Each from-status maps to an array of allowed to-statuses.
 * Terminal statuses (cancelled, refunded) have no entries.
 */
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled', 'refund_requested'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['refund_requested'],
  refund_requested: ['refunded'],
  cancelled: [], // terminal — no transitions out
  refunded: [], // terminal — no transitions out
};

/**
 * Validate that a transition from `fromStatus` to `toStatus` is allowed.
 * Throws an error if the transition is invalid.
 */
export function validateTransition(fromStatus: string, toStatus: string): void {
  if (fromStatus === toStatus) {
    throw new Error(`Cannot transition to the same status: ${fromStatus}`);
  }

  const allowed = VALID_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new Error(
      `Invalid status transition: ${fromStatus} → ${toStatus}`,
    );
  }
}

/**
 * Transition an order to a new status.
 * Updates the order, inserts a status_history row, and triggers side effects
 * for specific transitions (stock decrement, cart clearing on `paid`).
 *
 * Same-status "transitions" (e.g. re-arriving at awaiting_payment via
 * payment failure webhook) are allowed — only a history row is inserted;
 * no status update or side effects occur.
 */
export async function transitionOrder(
  orderId: string,
  toStatus: string,
  note?: string,
  changedBy?: string,
): Promise<void> {
  // Read current order status
  const result = await db.run(
    dbSql`SELECT id, status FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );
  const order = result.rows[0] as any;
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const fromStatus = order.status;

  // Same-status: log history only, no status change, no side effects
  if (fromStatus === toStatus) {
    await db.insert(order_status_history).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      from_status: fromStatus,
      to_status: toStatus,
      note: note ?? null,
      changed_by: changedBy ?? null,
      created_at: new Date(),
    });
    return;
  }

  // Validate the transition
  validateTransition(fromStatus, toStatus);

  // Update order status
  await db
    .update(orders)
    .set({ status: toStatus, updated_at: new Date() })
    .where(dbSql`${orders.id} = ${orderId}`);

  // Insert status history
  await db.insert(order_status_history).values({
    id: crypto.randomUUID(),
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    note: note ?? null,
    changed_by: changedBy ?? null,
    created_at: new Date(),
  });

  // Side effects for paid orders
  if (toStatus === 'paid') {
    await decrementStock(orderId);
    await clearCartForOrder(orderId);
  }
}