import { db, order_items, products, product_variants, sql as dbSql } from 'astro:db';

/**
 * Decrement stock for all line items in an order.
 *
 * - For items with product_id (but no variant_id): decrements products.stock
 * - For items with variant_id: decrements product_variants.stock
 * - Skips items where stock is null (unlimited stock)
 * - Stock never goes below 0
 */
export async function decrementStock(orderId: string): Promise<void> {
  const items = await db.run(
    dbSql`SELECT product_id, variant_id, quantity FROM ${order_items} WHERE ${order_items.order_id} = ${orderId}`,
  );

  for (const item of items.rows as any[]) {
    const { product_id, variant_id, quantity } = item;

    if (variant_id) {
      // Decrement variant stock (only if not null)
      await db.run(
        dbSql`UPDATE ${product_variants}
              SET ${product_variants.stock} = GREATEST(0, ${product_variants.stock} - ${quantity})
              WHERE ${product_variants.id} = ${variant_id}
              AND ${product_variants.stock} IS NOT NULL`,
      );
    } else if (product_id) {
      // Decrement product stock (only if not null)
      await db.run(
        dbSql`UPDATE ${products}
              SET ${products.stock} = GREATEST(0, ${products.stock} - ${quantity})
              WHERE ${products.id} = ${product_id}
              AND ${products.stock} IS NOT NULL`,
      );
    }
  }
}