import type { APIRoute } from 'astro';
import { db, cart_items, carts, orders, order_items, order_status_history, products, product_variants, product_prices, vouchers, sql as dbSql } from 'astro:db';
import { getOrCreateCart } from '../../../../lib/cart-session'
import { computeCartTotals } from '../../../../lib/cart-totals'
import type { CartItemInput } from '../../../../lib/cart-totals'
import { generateOrderNumber } from '../../../../lib/order-number'
import { z } from 'zod';

const CheckoutSchema = z
  .object({
    customer_type: z.enum(['individual', 'company']),
    customer_email: z.string().email(),
    customer_name: z.string().min(1),
    customer_phone: z.string().nullable().default(null),
    billing_name: z.string().min(1),
    billing_company: z.string().nullable().default(null),
    billing_vat_number: z.string().nullable().default(null),
    billing_address_line_1: z.string().min(1),
    billing_city: z.string().min(1),
    billing_state: z.string().min(1),
    billing_postal_code: z.string().min(1),
    billing_country: z.string().min(1),
    shipping_same_as_billing: z.boolean().default(false),
    shipping_type: z.enum(['physical', 'digital', 'pickup']),
    shipping_address_line_1: z.string().nullable().default(null),
    shipping_city: z.string().nullable().default(null),
    shipping_state: z.string().nullable().default(null),
    shipping_postal_code: z.string().nullable().default(null),
    shipping_country: z.string().nullable().default(null),
    currency: z.string().min(1).default('RON'),
    referral_code: z.string().nullable().default(null),
  })
  .superRefine((data, ctx) => {
    if (data.customer_type === 'company') {
      if (!data.billing_company) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'billing_company is required for company customers',
          path: ['billing_company'],
        });
      }
      if (!data.billing_vat_number) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'billing_vat_number is required for company customers',
          path: ['billing_vat_number'],
        });
      }
    }
    if (!data.shipping_same_as_billing && data.shipping_type === 'physical') {
      if (!data.shipping_address_line_1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_address_line_1 is required when shipping differs from billing',
          path: ['shipping_address_line_1'],
        });
      }
      if (!data.shipping_city) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_city is required when shipping differs from billing',
          path: ['shipping_city'],
        });
      }
      if (!data.shipping_postal_code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_postal_code is required when shipping differs from billing',
          path: ['shipping_postal_code'],
        });
      }
      if (!data.shipping_country) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_country is required when shipping differs from billing',
          path: ['shipping_country'],
        });
      }
    }
  });

export const POST: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    // Fetch cart items
    const itemsResult = await db.run(
      dbSql`SELECT * FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cart.id}`
    );
    const items = itemsResult.rows as any[];

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cart is empty' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate body
    const body = await context.request.json();
    const parsed = CheckoutSchema.safeParse(body);

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

    const data = parsed.data;

    // Stock re-validation: re-fetch current stock before creating order
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const productResult = await db.run(
        dbSql`SELECT ${products.stock}, ${products.active} FROM ${products} WHERE ${products.id} = ${item.product_id} LIMIT 1`
      );
      if (productResult.rows.length === 0 || !(productResult.rows[0] as any).active) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Product no longer available',
            field: `items[${i}]`,
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const product = productResult.rows[0] as any;
      let availableStock: number | null = product.stock;

      if (item.variant_id) {
        const variantResult = await db.run(
          dbSql`SELECT ${product_variants.stock} FROM ${product_variants} WHERE ${product_variants.id} = ${item.variant_id} LIMIT 1`
        );
        if (variantResult.rows.length > 0) {
          availableStock = (variantResult.rows[0] as any).stock;
        }
      }

      if (availableStock !== null && item.quantity > availableStock) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Insufficient stock',
            field: `items[${i}]`,
            product_id: item.product_id,
            variant_id: item.variant_id,
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Enrich items with prices
    const cartItemInputs = await enrichItemsWithPrices(items, data.currency);

    // Compute totals
    let discountAmount = 0;

    // Apply voucher discount if voucher is on cart
    if (cart.applied_voucher_code) {
      const voucherResult = await db.run(
        dbSql`SELECT * FROM ${vouchers} WHERE ${vouchers.code} = ${cart.applied_voucher_code} LIMIT 1`
      );
      if (voucherResult.rows.length > 0) {
        const voucher = voucherResult.rows[0] as any;
        const baseTotals = computeCartTotals(cartItemInputs, data.currency);

        if (voucher.type === 'fixed_amount') {
          discountAmount = Math.min(voucher.value ?? 0, baseTotals.subtotal_net);
        } else if (voucher.type === 'percentage') {
          discountAmount = Math.round(baseTotals.subtotal_net * ((voucher.value ?? 0) / 100) * 100) / 100;
        }
        // free_shipping: apply at checkout level
        if (voucher.type === 'free_shipping') {
          // discount_amount stays 0 for now, shipping_cost = 0 in cart
        }
      }
    }

    const totals = computeCartTotals(cartItemInputs, data.currency, 0, discountAmount);

    // Generate order number
    const orderNumber = await generateOrderNumber();

    // Build billing info from single name field (split into first/last)
    const nameParts = data.billing_name.trim().split(/\s+/);
    const billingFirstName = nameParts[0] || '';
    const billingLastName = nameParts.slice(1).join(' ') || billingFirstName;

    // Build shipping info
    const shippingName = data.shipping_same_as_billing
      ? data.billing_name
      : data.billing_name;
    const shipNameParts = shippingName.trim().split(/\s+/);
    const shippingFirstName = shipNameParts[0] || billingFirstName;
    const shippingLastName = shipNameParts.slice(1).join(' ') || billingLastName;

    const shippingAddressLine1 = data.shipping_same_as_billing
      ? data.billing_address_line_1
      : (data.shipping_address_line_1 ?? data.billing_address_line_1);

    const shippingCity = data.shipping_same_as_billing
      ? data.billing_city
      : (data.shipping_city ?? data.billing_city);

    const shippingState = data.shipping_same_as_billing
      ? data.billing_state
      : (data.shipping_state ?? data.billing_state);

    const shippingPostalCode = data.shipping_same_as_billing
      ? data.billing_postal_code
      : (data.shipping_postal_code ?? data.billing_postal_code);

    const shippingCountry = data.shipping_same_as_billing
      ? data.billing_country
      : (data.shipping_country ?? data.billing_country);

    // Create the order
    const orderId = crypto.randomUUID();
    const now = new Date();

    await db.insert(orders).values({
      id: orderId,
      order_number: orderNumber,
      user_id: cart.user_id ?? null,
      customer_type: data.customer_type,
      customer_email: data.customer_email,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      status: 'pending',
      currency: data.currency,
      subtotal_net: totals.subtotal_net,
      vat_total: totals.vat_total,
      shipping_cost: totals.shipping_cost,
      discount_amount: totals.discount_amount,
      total: totals.total,
      shipping_type: data.shipping_type,
      shipping_method: null,
      voucher_code: cart.applied_voucher_code ?? null,
      referral_code: data.referral_code ?? cart.applied_referral_code ?? null,
      billing_first_name: billingFirstName,
      billing_last_name: billingLastName,
      billing_address: data.billing_address_line_1,
      billing_city: data.billing_city,
      billing_postal_code: data.billing_postal_code,
      billing_country: data.billing_country,
      billing_county: data.billing_state,
      billing_phone: data.customer_phone,
      billing_company: data.billing_company,
      billing_vat_number: data.billing_vat_number,
      shipping_first_name: shippingFirstName,
      shipping_last_name: shippingLastName,
      shipping_address: shippingAddressLine1,
      shipping_city: shippingCity,
      shipping_postal_code: shippingPostalCode,
      shipping_country: shippingCountry,
      shipping_county: shippingState,
      shipping_phone: data.customer_phone,
      shipping_company: data.billing_company,
      shipping_vat_number: data.billing_vat_number,
      shipping_same_as_billing: data.shipping_same_as_billing,
      payment_provider: null,
      payment_intent_id: null,
      transaction_id: null,
      refund_amount: null,
      refund_notes: null,
      refunded_at: null,
      notes: null,
      created_at: now,
      updated_at: now,
    });

    // Create order_items (snapshot)
    for (const line of totals.items) {
      await db.insert(order_items).values({
        id: crypto.randomUUID(),
        order_id: orderId,
        product_id: line.product_id,
        variant_id: line.variant_id,
        product_name: line.product_name,
        sku: line.sku,
        quantity: line.quantity,
        price_net: line.price_net,
        vat_rate: line.vat_rate,
        price_gross: line.price_gross,
        currency: data.currency,
      });
    }

    // Create order_status_history entry
    await db.insert(order_status_history).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      from_status: null,
      to_status: 'pending',
      note: null,
      changed_by: null,
      created_at: now,
    });

    // Increment voucher uses_count if voucher was applied
    if (cart.applied_voucher_code) {
      await db.run(
        dbSql`UPDATE ${vouchers} SET ${vouchers.uses_count} = ${vouchers.uses_count} + 1 WHERE ${vouchers.code} = ${cart.applied_voucher_code}`
      );
    }

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
          order_id: orderId,
          order_number: orderNumber,
          totals,
          payment_providers: ['stripe', 'euplatesc'],
        },
      }),
      { status: 201, headers }
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