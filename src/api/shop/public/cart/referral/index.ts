import type { APIRoute } from 'astro';
import { db, cart_items, referral_codes, carts, products, product_variants, product_prices, sql as dbSql } from 'astro:db';
import { getOrCreateCart } from '../../../../../lib/cart-session.ts';
import { computeCartTotals } from '../../../../../lib/cart-totals.ts';
import type { CartItemInput } from '../../../../../lib/cart-totals.ts';
import { ApplyCartReferralSchema } from '../../../../../schemas/cart.schema.ts';

export const POST: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    const body = await context.request.json();
    const parsed = ApplyCartReferralSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(
            parsed.error.issues.map(i => [i.path.join('.'), i.message])
          ),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { code } = parsed.data;
    const normalizedCode = code.trim().toUpperCase();

    // Find referral code
    const referralResult = await db.run(
      dbSql`SELECT * FROM ${referral_codes} WHERE UPPER(${referral_codes.code}) = ${normalizedCode} LIMIT 1`
    );

    if (referralResult.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Referral code not found or inactive' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const referral = referralResult.rows[0] as any;

    if (!referral.active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Referral code not found or inactive' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch cart items with prices
    const itemsResult = await db.run(
      dbSql`SELECT * FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cart.id}`
    );
    const items = itemsResult.rows as any[];

    const cartItemInputs = await enrichItemsWithPrices(items);

    let discountAmount = 0;

    if (referral.discount_type && referral.discount_value !== null) {
      const baseTotals = computeCartTotals(cartItemInputs, 'RON');

      if (referral.discount_type === 'fixed_amount') {
        discountAmount = Math.min(referral.discount_value, baseTotals.subtotal_net);
      } else if (referral.discount_type === 'percentage') {
        discountAmount = Math.round(baseTotals.subtotal_net * (referral.discount_value / 100) * 100) / 100;
      }
    }

    // Store applied referral on cart
    await db.run(
      dbSql`UPDATE ${carts} SET ${carts.applied_referral_code} = ${referral.code} WHERE ${carts.id} = ${cart.id}`
    );

    const totals = computeCartTotals(cartItemInputs, 'RON', 0, discountAmount);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (setCookie) {
      headers['Set-Cookie'] = setCookie;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          referral: {
            code: referral.code,
            name: referral.name,
            discount_type: referral.discount_type,
            discount_value: referral.discount_value,
          },
          discount_amount: discountAmount,
          totals,
        },
      }),
      { status: 200, headers }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * Enrich cart items with price data for totals computation
 */
async function enrichItemsWithPrices(items: any[]): Promise<CartItemInput[]> {
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
      currency: 'RON',
    });
  }

  return result;
}