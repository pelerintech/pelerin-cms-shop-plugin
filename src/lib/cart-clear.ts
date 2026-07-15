import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { orders, carts, cart_items } from '../db/schema.ts';
import { markCartConverted, clearCart } from './data/cart.ts';

/**
 * Clear the cart associated with an order after payment.
 *
 * Finds the cart linked to the order's user_id, deletes all cart_items,
 * and marks the cart as converted.
 *
 * If the order has no user_id (guest checkout) or no matching cart is found,
 * the function silently does nothing.
 *
 * `db` is injected (no astro:db import).
 */
export async function clearCartForOrder(db: LibSQLDatabase, orderId: string): Promise<void> {
  // Get the order's user_id
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || !order.user_id) {
    return;
  }

  // Find the most recent unconverted cart for this user
  const userCarts = await db.select().from(carts).where(eq(carts.user_id, order.user_id));
  const unconverted = userCarts
    .filter((c) => c.converted_at === null)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

  if (unconverted.length === 0) {
    return;
  }

  const cartId = unconverted[0].id;
  await clearCart(db, cartId);
  await markCartConverted(db, cartId);
}
