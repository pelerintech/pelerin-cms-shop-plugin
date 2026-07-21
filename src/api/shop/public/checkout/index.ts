import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrCreateCart } from '../../../../lib/cart-session';
import {
  getCartWithItems,
  validateCartStock,
  StockValidationError,
} from '../../../../lib/data/cart';
import { createOrder } from '../../../../lib/data/orders';
import { getVoucherByCode, incrementVoucherUsage } from '../../../../lib/data/vouchers';
import { computeCartTotals } from '../../../../lib/cart-totals';
import { getShopConfig, getSetting } from '../../../../lib/data/settings';
import { z } from 'zod';
import type { HandlerDeps } from '../../../../lib/handler-types';
import { listProviders } from '../../../../providers/payment/registry';
// Import provider modules to ensure they are registered
import '../../../../providers/payment/stripe';
import '../../../../providers/payment/euplatesc';
import '../../../../providers/payment/bank_transfer';
import '../../../../providers/payment/ramburs';

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
    currency: z.string().min(1).optional(),
    referral_code: z.string().nullable().default(null),
    provider: z.string().min(1, { message: 'provider is required' }),
  })
  .superRefine((data, ctx) => {
    if (data.customer_type === 'company') {
      if (!data.billing_company)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'billing_company is required for company customers',
          path: ['billing_company'],
        });
      if (!data.billing_vat_number)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'billing_vat_number is required for company customers',
          path: ['billing_vat_number'],
        });
    }
    if (!data.shipping_same_as_billing && data.shipping_type === 'physical') {
      if (!data.shipping_address_line_1)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_address_line_1 is required when shipping differs from billing',
          path: ['shipping_address_line_1'],
        });
      if (!data.shipping_city)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_city is required when shipping differs from billing',
          path: ['shipping_city'],
        });
      if (!data.shipping_postal_code)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_postal_code is required when shipping differs from billing',
          path: ['shipping_postal_code'],
        });
      if (!data.shipping_country)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_country is required when shipping differs from billing',
          path: ['shipping_country'],
        });
    }
  });

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const { cart, setCookie } = await getOrCreateCart(db, sdk, ctx.request);
    const config = await getShopConfig(db);

    const result = await getCartWithItems(db, cart.id, config.defaultCurrency);
    const items = result?.items ?? [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Cart is empty' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await ctx.request.json();
    const parsed = CheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = parsed.data;
    const currency = data.currency ?? config.defaultCurrency;

    // Validate the provider against the runtime configured list
    const configuredProviders = (
      await Promise.all(
        listProviders().map(async (p) => ({
          name: p.name,
          configured: await p.isConfigured(db),
        }))
      )
    )
      .filter((p) => p.configured)
      .map((p) => p.name);

    if (!configuredProviders.includes(data.provider)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Payment provider "${data.provider}" is not available`,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Stock re-validation via accessor
    try {
      await validateCartStock(db, items);
    } catch (e: any) {
      if (e instanceof StockValidationError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: e.message,
            product_id: e.product_id,
            variant_id: e.variant_id,
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      throw e;
    }

    // Re-enrich with the checkout currency
    const enrichedResult = await getCartWithItems(db, cart.id, currency);
    const cartItemInputs = enrichedResult?.items ?? [];

    // Compute discount from applied voucher
    let discountAmount = 0;
    if (cart.applied_voucher_code) {
      const voucher = await getVoucherByCode(db, cart.applied_voucher_code);
      if (voucher && voucher.active) {
        const baseTotals = computeCartTotals(cartItemInputs as any, currency);
        if (voucher.type === 'fixed_amount')
          discountAmount = Math.min(voucher.value ?? 0, baseTotals.subtotal_net);
        else if (voucher.type === 'percentage')
          discountAmount =
            Math.round(baseTotals.subtotal_net * ((voucher.value ?? 0) / 100) * 100) / 100;
      }
    }

    const totals = computeCartTotals(cartItemInputs as any, currency, 0, discountAmount);

    // Build name parts
    const nameParts = data.billing_name.trim().split(/\s+/);
    const billingFirstName = nameParts[0] || '';
    const billingLastName = nameParts.slice(1).join(' ') || billingFirstName;
    const shippingFirstName = billingFirstName;
    const shippingLastName = billingLastName;
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

    // Create the order via accessor (handles items, stock decrement, cart clear).
    // createOrder generates its own order_number (transactional, with UNIQUE retry).
    const order = await createOrder(db, {
      order_number: null,
      user_id: cart.user_id ?? null,
      customer_type: data.customer_type,
      customer_email: data.customer_email,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      currency,
      subtotal_net: totals.subtotal_net,
      vat_total: totals.vat_total,
      shipping_cost: totals.shipping_cost,
      discount_amount: totals.discount_amount,
      total: totals.total,
      shipping_type: data.shipping_type,
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
      cart_id: cart.id,
      payment_provider: data.provider,
      items: totals.items.map((line: any) => ({
        product_id: line.product_id,
        variant_id: line.variant_id,
        product_name: line.product_name,
        sku: line.sku,
        quantity: line.quantity,
        price_net: line.price_net,
        vat_rate: line.vat_rate,
        price_gross: line.price_gross,
        currency,
      })),
    });

    // Increment voucher usage if applied
    if (cart.applied_voucher_code) {
      const voucher = await getVoucherByCode(db, cart.applied_voucher_code);
      if (voucher) await incrementVoucherUsage(db, voucher.id);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (setCookie) headers['Set-Cookie'] = setCookie;

    // Build the payment response object
    const payment: Record<string, any> = { provider: data.provider };
    if (data.provider === 'bank_transfer') {
      const ben = await getSetting(db, 'bank_transfer_beneficiary');
      const iban = await getSetting(db, 'bank_transfer_iban');
      const bankName = await getSetting(db, 'bank_transfer_bank_name');
      const refNote = await getSetting(db, 'bank_transfer_reference_note');
      const instructions: Record<string, any> = {
        beneficiary: ben,
        iban,
        reference: order.order_number,
      };
      if (bankName) instructions.bank_name = bankName;
      if (refNote) instructions.reference_note = refNote;
      payment.instructions = instructions;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          order_id: order.id,
          order_number: order.order_number,
          totals,
          payment_providers: configuredProviders,
          payment,
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
}
