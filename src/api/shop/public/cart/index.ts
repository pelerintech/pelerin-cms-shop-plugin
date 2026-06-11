import type { APIRoute } from 'astro';
import { db, cart_items, carts, products, product_prices, product_variants, vouchers, referral_codes, sql as dbSql } from 'astro:db';
import { getOrCreateCart } from '../../../../lib/cart-session'
import { computeCartTotals } from '../../../../lib/cart-totals'
import type { CartItemInput } from '../../../../lib/cart-totals'

export const POST: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    // Fetch cart items
    const itemsResult = await db.run(
      dbSql`SELECT * FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cart.id}`
    );
    const items = itemsResult.rows as any[];

    // Enrich items with product names and prices
    const cartItemInputs = await enrichItemsWithPrices(items, 'RON');

    // Compute discount from applied voucher/referral
    let discountAmount = 0;
    if (cart.applied_voucher_code) {
      discountAmount = await computeVoucherDiscount(cart.applied_voucher_code, cartItemInputs);
    } else if (cart.applied_referral_code) {
      discountAmount = await computeReferralDiscount(cart.applied_referral_code, cartItemInputs);
    }

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
          cart_id: cart.id,
          session_id: cart.session_id,
          items: totals.items,
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

export const GET: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    // Parse currency from query param
    const url = new URL(context.request.url);
    const currency = url.searchParams.get('currency') || 'RON';

    // Fetch cart items
    const itemsResult = await db.run(
      dbSql`SELECT * FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cart.id}`
    );
    const items = itemsResult.rows as any[];

    // Enrich items with product names and prices
    const cartItemInputs = await enrichItemsWithPrices(items, currency);

    // Compute discount from applied voucher/referral
    let discountAmount = 0;
    if (cart.applied_voucher_code) {
      discountAmount = await computeVoucherDiscount(cart.applied_voucher_code, cartItemInputs);
    } else if (cart.applied_referral_code) {
      discountAmount = await computeReferralDiscount(cart.applied_referral_code, cartItemInputs);
    }

    const totals = computeCartTotals(cartItemInputs, currency, 0, discountAmount);

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
          cart_id: cart.id,
          session_id: cart.session_id,
          items: totals.items,
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

/**
 * Compute discount from an applied voucher code.
 */
async function computeVoucherDiscount(code: string, items: CartItemInput[]): Promise<number> {
  const voucherResult = await db.run(
    dbSql`SELECT type, value FROM ${vouchers} WHERE ${vouchers.code} = ${code} LIMIT 1`
  );
  if (voucherResult.rows.length === 0) return 0;

  const voucher = voucherResult.rows[0] as any;
  const baseTotals = computeCartTotals(items, 'RON');

  if (voucher.type === 'fixed_amount') {
    return Math.min(voucher.value ?? 0, baseTotals.subtotal_net);
  } else if (voucher.type === 'percentage') {
    return Math.round(baseTotals.subtotal_net * ((voucher.value ?? 0) / 100) * 100) / 100;
  }
  // free_shipping: discount = 0 in cart (applied at checkout)
  return 0;
}

/**
 * Compute discount from an applied referral code.
 */
async function computeReferralDiscount(code: string, items: CartItemInput[]): Promise<number> {
  const refResult = await db.run(
    dbSql`SELECT discount_type, discount_value FROM ${referral_codes} WHERE ${referral_codes.code} = ${code} LIMIT 1`
  );
  if (refResult.rows.length === 0) return 0;

  const referral = refResult.rows[0] as any;
  if (!referral.discount_type || referral.discount_value === null) return 0;

  const baseTotals = computeCartTotals(items, 'RON');

  if (referral.discount_type === 'fixed_amount') {
    return Math.min(referral.discount_value, baseTotals.subtotal_net);
  } else if (referral.discount_type === 'percentage') {
    return Math.round(baseTotals.subtotal_net * (referral.discount_value / 100) * 100) / 100;
  }
  return 0;
}
