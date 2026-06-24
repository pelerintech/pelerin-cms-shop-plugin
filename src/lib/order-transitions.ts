import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { transitionOrderStatus, validateTransition, OrderTransitionError } from './data/orders.ts';

export { validateTransition, OrderTransitionError };

/**
 * Transition an order to a new status.
 * Delegates to the data accessor. `db` is injected (no astro:db import).
 */
export async function transitionOrder(
  db: LibSQLDatabase,
  orderId: string,
  toStatus: string,
  note?: string | null,
  changedBy?: string | null,
): Promise<void> {
  await transitionOrderStatus(db, orderId, toStatus, note, changedBy);
}
