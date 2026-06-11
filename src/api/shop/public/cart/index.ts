import type { APIRoute } from 'astro';
import { db, cart_items, carts, products, product_prices, product_variants, vouchers, referral_codes, product_attribute_values, product_attribute_assignments, product_attributes, translations, sql as dbSql } from 'astro:db';
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

  // Fetch variant-level attribute values for all variants in cart
  const variantAttributesMap = new Map<string, any[]>();
  if (variantIds.length > 0) {
    const vavResult = await db.run(
      dbSql`SELECT * FROM ${product_attribute_values} WHERE ${product_attribute_values.entity_type} = 'variant' AND ${product_attribute_values.entity_id} IN (${dbSql.join(variantIds.map((id: string) => dbSql`${id}`))})`
    );
    const vavRows = vavResult.rows as any[];

    // Fetch assignment details
    const assignmentIds = Array.from(new Set(vavRows.map(v => v.assignment_id)));
    const assignmentsMap = new Map<string, any>();
    if (assignmentIds.length > 0) {
      const assignments = await db
        .select()
        .from(product_attribute_assignments)
        .where(
          dbSql`${product_attribute_assignments.id} IN (${dbSql.join(assignmentIds.map(aid => dbSql`${aid}`))})`
        );
      for (const a of assignments) {
        assignmentsMap.set(a.id, a);
      }
    }

    // Fetch attribute details
    const attributeIds = Array.from(new Set(
      Array.from(assignmentsMap.values()).map(a => a.attribute_id)
    ));
    const attributesMap = new Map<string, any>();
    if (attributeIds.length > 0) {
      const attrs = await db
        .select()
        .from(product_attributes)
        .where(
          dbSql`${product_attributes.id} IN (${dbSql.join(attributeIds.map(aid => dbSql`${aid}`))})`
        );
      for (const attr of attrs) {
        attributesMap.set(attr.id, attr);
      }
    }

    // Fetch option labels for select-type values
    const optionIds = Array.from(new Set(
      vavRows.filter(v => v.option_id).map(v => v.option_id)
    ));
    const optionLabelsMap = new Map<string, string>();
    if (optionIds.length > 0) {
      const optTransRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute_option' AND ${translations.locale} = 'ro' AND ${translations.entity_id} IN (${dbSql.join(optionIds.map(oid => dbSql`${oid}`))})`
        );
      for (const t of optTransRows) {
        if (t.label) optionLabelsMap.set(t.entity_id, t.label);
      }
    }

    // Build variant → attributes map
    for (const val of vavRows) {
      if (!variantAttributesMap.has(val.entity_id)) {
        variantAttributesMap.set(val.entity_id, []);
      }
      const assignment = assignmentsMap.get(val.assignment_id);
      const attr = assignment ? attributesMap.get(assignment.attribute_id) : null;

      let value: string | number | boolean | null = null;
      if (val.option_id) {
        value = optionLabelsMap.get(val.option_id) || val.option_id;
      } else if (val.value_text !== null) {
        value = val.value_text;
      } else if (val.value_number !== null) {
        value = val.value_number;
      } else if (val.value_boolean !== null) {
        value = val.value_boolean;
      }

      variantAttributesMap.get(val.entity_id)!.push({
        attribute_name: attr?.name || '',
        attribute_type: attr?.type || '',
        role: assignment?.role || '',
        value,
      });
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
      attributes: variantAttributesMap.get(item.variant_id) || [],
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
