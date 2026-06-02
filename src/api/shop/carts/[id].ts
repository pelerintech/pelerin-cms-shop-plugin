import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, carts, cart_items, products, product_variants, product_prices, sql as dbSql } from 'astro:db';
import { computeCartTotals } from '../../../lib/cart-totals'
import type { CartItemInput } from '../../../lib/cart-totals'

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const cartId = context.params.id;

    // Fetch cart
    const cartResult = await db.run(
      dbSql`SELECT * FROM ${carts} WHERE ${carts.id} = ${cartId} LIMIT 1`
    );

    if (cartResult.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cart not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const cart = cartResult.rows[0] as any;

    // Fetch cart items
    const itemsResult = await db.run(
      dbSql`SELECT * FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cartId}`
    );
    const items = itemsResult.rows as any[];

    // Enrich items with prices
    const cartItemInputs = await enrichItemsWithPrices(items, 'RON');

    // Compute totals with any applied discounts
    const totals = computeCartTotals(cartItemInputs, 'RON', 0, 0);

    const ageMs = Date.now() - new Date(cart.created_at).getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: cart.id,
          session_id: cart.session_id,
          user_id: cart.user_id,
          applied_voucher_code: cart.applied_voucher_code,
          applied_referral_code: cart.applied_referral_code,
          items: totals.items,
          totals,
          age_hours: ageHours,
          created_at: cart.created_at,
          updated_at: cart.updated_at,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * Enrich cart items with price data for totals computation.
 */
async function enrichItemsWithPrices(items: any[], currency: string): Promise<CartItemInput[]> {
  if (items.length === 0) return [];

  const productIds = [...new Set(items.filter((i: any) => i.product_id).map((i: any) => i.product_id))];
  const variantIds = [...new Set(items.filter((i: any) => i.variant_id).map((i: any) => i.variant_id))];

  let productMap = new Map();
  if (productIds.length > 0) {
    const prodResult = await db.run(
      dbSql`SELECT id, name, sku, vat_rate FROM ${products} WHERE ${products.id} IN (${dbSql.join(productIds.map((id: string) => dbSql`${id}`))})`
    );
    for (const row of prodResult.rows as any[]) {
      productMap.set(row.id, row);
    }
  }

  let variantMap = new Map();
  if (variantIds.length > 0) {
    const varResult = await db.run(
      dbSql`SELECT id, sku FROM ${product_variants} WHERE ${product_variants.id} IN (${dbSql.join(variantIds.map((id: string) => dbSql`${id}`))})`
    );
    for (const row of varResult.rows as any[]) {
      variantMap.set(row.id, row);
    }
  }

  const result: CartItemInput[] = [];

  for (const item of items) {
    let priceNet = 0;

    if (item.variant_id) {
      const priceResult = await db.run(
        dbSql`SELECT price_net FROM ${product_prices} WHERE ${product_prices.variant_id} = ${item.variant_id} AND ${product_prices.currency} = ${currency} LIMIT 1`
      );
      if (priceResult.rows.length > 0) {
        priceNet = (priceResult.rows[0] as any).price_net;
      }
    } else if (item.product_id) {
      const priceResult = await db.run(
        dbSql`SELECT price_net FROM ${product_prices} WHERE ${product_prices.product_id} = ${item.product_id} AND ${product_prices.variant_id} IS NULL AND ${product_prices.currency} = ${currency} LIMIT 1`
      );
      if (priceResult.rows.length > 0) {
        priceNet = (priceResult.rows[0] as any).price_net;
      }
    }

    const product = productMap.get(item.product_id);
    const variant = item.variant_id ? variantMap.get(item.variant_id) : null;

    result.push({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: product?.name ?? 'Unknown',
      sku: variant?.sku ?? product?.sku ?? null,
      quantity: item.quantity,
      price_net: priceNet,
      vat_rate: product?.vat_rate ?? null,
      currency,
    });
  }

  return result;
}
