import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, carts, cart_items, product_prices, products, sql as dbSql } from 'astro:db';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const url = new URL(context.request.url);
    const abandonedSince = url.searchParams.get('abandoned_since'); // hours
    const userIdFilter = url.searchParams.get('user_id');

    let query: any;

    if (abandonedSince && userIdFilter) {
      const hoursAgo = parseInt(abandonedSince);
      const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      query = db.run(
        dbSql`SELECT * FROM ${carts} WHERE ${carts.updated_at} < ${cutoff} AND ${carts.user_id} = ${userIdFilter} ORDER BY ${carts.updated_at} DESC`
      );
    } else if (abandonedSince) {
      const hoursAgo = parseInt(abandonedSince);
      const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      query = db.run(
        dbSql`SELECT * FROM ${carts} WHERE ${carts.updated_at} < ${cutoff} ORDER BY ${carts.updated_at} DESC`
      );
    } else if (userIdFilter) {
      query = db.run(
        dbSql`SELECT * FROM ${carts} WHERE ${carts.user_id} = ${userIdFilter} ORDER BY ${carts.updated_at} DESC`
      );
    } else {
      query = db.run(
        dbSql`SELECT * FROM ${carts} ORDER BY ${carts.updated_at} DESC`
      );
    }

    const result = await query;
    const cartList = result.rows as any[];

    // Get item counts and total values for each cart
    const enriched = [];
    for (const cart of cartList) {
      const countResult = await db.run(
        dbSql`SELECT COUNT(*) as item_count, SUM(${cart_items.quantity}) as total_quantity FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cart.id}`
      );
      const counts = countResult.rows[0] as any;

      // Compute approximate total value from cart items × product prices
      let totalValue = await computeCartTotalValue(cart.id);

      const ageMs = Date.now() - new Date(cart.created_at).getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

      enriched.push({
        id: cart.id,
        session_id: cart.session_id,
        user_id: cart.user_id,
        item_count: counts?.item_count ?? 0,
        total_quantity: counts?.total_quantity ?? 0,
        total_value: totalValue,
        applied_voucher_code: cart.applied_voucher_code,
        applied_referral_code: cart.applied_referral_code,
        created_at: cart.created_at,
        updated_at: cart.updated_at,
        age_hours: ageHours,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: enriched,
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
 * Compute approximate total value (gross) for a cart by summing price × quantity for each item.
 * Returns 0 if no prices available.
 */
async function computeCartTotalValue(cartId: string): Promise<number> {
  const itemsResult = await db.run(
    dbSql`SELECT ci.product_id, ci.variant_id, ci.quantity, p.vat_rate
     FROM ${cart_items} ci
     LEFT JOIN ${products} p ON p.id = ci.product_id
     WHERE ci.cart_id = ${cartId}`
  );
  const items = itemsResult.rows as any[];

  if (items.length === 0) return 0;

  let total = 0;

  for (const item of items) {
    let priceNet = 0;

    if (item.variant_id) {
      const priceResult = await db.run(
        dbSql`SELECT price_net FROM ${product_prices} WHERE ${product_prices.variant_id} = ${item.variant_id} AND ${product_prices.currency} = 'RON' LIMIT 1`
      );
      if (priceResult.rows.length > 0) {
        priceNet = (priceResult.rows[0] as any).price_net;
      }
    } else if (item.product_id) {
      const priceResult = await db.run(
        dbSql`SELECT price_net FROM ${product_prices} WHERE ${product_prices.product_id} = ${item.product_id} AND ${product_prices.variant_id} IS NULL AND ${product_prices.currency} = 'RON' LIMIT 1`
      );
      if (priceResult.rows.length > 0) {
        priceNet = (priceResult.rows[0] as any).price_net;
      }
    }

    const vatRate = item.vat_rate ?? 0;
    const priceGross = priceNet * (1 + vatRate);
    total += Math.round(priceGross * item.quantity * 100) / 100;
  }

  return total;
}