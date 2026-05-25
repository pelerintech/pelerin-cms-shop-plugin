import { db, carts, cart_items, orders, sql as dbSql } from 'astro:db';

/**
 * Clear the cart associated with an order after payment.
 *
 * Finds the cart linked to the order's user_id, deletes all cart_items,
 * and marks the cart as converted.
 *
 * If the order has no user_id (guest checkout) or no matching cart is found,
 * the function silently does nothing.
 */
export async function clearCartForOrder(orderId: string): Promise<void> {
  // Get the order's user_id
  const orderResult = await db.run(
    dbSql`SELECT user_id FROM ${orders} WHERE ${orders.id} = ${orderId} LIMIT 1`,
  );
  const order = orderResult.rows[0] as any;
  if (!order || !order.user_id) {
    // Guest order — no cart to clear (session cart expired on its own)
    return;
  }

  // Find the most recent unconverted cart for this user
  const cartResult = await db.run(
    dbSql`SELECT id FROM ${carts}
          WHERE ${carts.user_id} = ${order.user_id}
          AND ${carts.converted_at} IS NULL
          ORDER BY ${carts.updated_at} DESC LIMIT 1`,
  );

  if (cartResult.rows.length === 0) {
    return; // No cart to clear
  }

  const cartId = (cartResult.rows[0] as any).id;

  // Delete all cart items
  await db.run(
    dbSql`DELETE FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cartId}`,
  );

  // Mark cart as converted
  await db.run(
    dbSql`UPDATE ${carts}
          SET ${carts.converted_at} = ${new Date()}
          WHERE ${carts.id} = ${cartId}`,
  );
}