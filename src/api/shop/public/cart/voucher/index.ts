import type { APIRoute } from 'astro';
import { db, cart_items, vouchers, carts, products, product_variants, product_prices, sql as dbSql } from 'astro:db';
import { getOrCreateCart } from '../../../../../lib/cart-session.ts';
import { computeCartTotals } from '../../../../../lib/cart-totals.ts';
import type { CartItemInput } from '../../../../../lib/cart-totals.ts';
import { ApplyCartVoucherSchema } from '../../../../../schemas/cart.schema.ts';

export const POST: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    const body = await context.request.json();
    const parsed = ApplyCartVoucherSchema.safeParse(body);

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

    // Find voucher by code (case-insensitive)
    const voucherResult = await db.run(
      dbSql`SELECT * FROM ${vouchers} WHERE UPPER(${vouchers.code}) = ${normalizedCode} LIMIT 1`
    );

    if (voucherResult.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Voucher not found or inactive' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const voucher = voucherResult.rows[0] as any;

    // Validate active
    if (!voucher.active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Voucher not found or inactive' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate date range
    const now = new Date();
    if (voucher.valid_from && now < new Date(voucher.valid_from)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Voucher is not yet valid' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (voucher.valid_until && now > new Date(voucher.valid_until)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Voucher has expired' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate max_uses
    if (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses) {
      return new Response(
        JSON.stringify({ success: false, error: 'Voucher usage limit reached' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch cart items with prices to compute subtotal
    const itemsResult = await db.run(
      dbSql`SELECT * FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cart.id}`
    );
    const items = itemsResult.rows as any[];

    // Get product prices for cart items
    const cartItemInputs = await enrichItemsWithPrices(items);

    if (cartItemInputs.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cart is empty' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const baseTotals = computeCartTotals(cartItemInputs, 'RON');

    // Validate min_order_value
    if (voucher.min_order_value !== null && baseTotals.subtotal_net < voucher.min_order_value) {
      return new Response(
        JSON.stringify({ success: false, error: 'Minimum order value not met' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Compute discount
    let discountAmount = 0;
    if (voucher.type === 'fixed_amount') {
      discountAmount = Math.min(voucher.value ?? 0, baseTotals.subtotal_net);
    } else if (voucher.type === 'percentage') {
      discountAmount = Math.round(baseTotals.subtotal_net * ((voucher.value ?? 0) / 100) * 100) / 100;
    }
    // free_shipping: discount applied at checkout (shipping_cost = 0 in cart)

    // Store applied voucher on cart
    await db.run(
      dbSql`UPDATE ${carts} SET ${carts.applied_voucher_code} = ${voucher.code} WHERE ${carts.id} = ${cart.id}`
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
          voucher: {
            code: voucher.code,
            type: voucher.type,
            value: voucher.value,
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

export const DELETE: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    // Remove applied voucher
    await db.run(
      dbSql`UPDATE ${carts} SET ${carts.applied_voucher_code} = NULL WHERE ${carts.id} = ${cart.id}`
    );

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
          voucher_removed: true,
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

  // Fetch product info
  let productMap = new Map();
  if (productIds.length > 0) {
    const prodResult = await db.run(
      dbSql`SELECT id, name, sku, vat_rate FROM ${products} WHERE ${products.id} IN (${dbSql.join(productIds.map((id: string) => dbSql`${id}`))})`
    );
    for (const row of prodResult.rows as any[]) {
      productMap.set(row.id, row);
    }
  }

  // Fetch variant SKUs
  let variantMap = new Map();
  if (variantIds.length > 0) {
    const varResult = await db.run(
      dbSql`SELECT id, sku FROM ${product_variants} WHERE ${product_variants.id} IN (${dbSql.join(variantIds.map((id: string) => dbSql`${id}`))})`
    );
    for (const row of varResult.rows as any[]) {
      variantMap.set(row.id, row);
    }
  }

  // Fetch prices for all items
  // For variant items, look up variant price; for simple products, look up product price
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