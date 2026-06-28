import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrCreateCart } from '../../../../../lib/cart-session';
import { getCartWithItems, setCartVoucher } from '../../../../../lib/data/cart';
import { getVoucherByCode } from '../../../../../lib/data/vouchers';
import { computeCartTotals } from '../../../../../lib/cart-totals';
import { ApplyCartVoucherSchema } from '../../../../../schemas/cart.schema';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const POST: APIRoute = (context) => { const sdk = createPluginContext(); return runPost({ db: sdk.db, sdk, ctx: context }); }

export const DELETE: APIRoute = (context) => { const sdk = createPluginContext(); return runDelete({ db: sdk.db, sdk, ctx: context }); }

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const { cart, setCookie } = await getOrCreateCart(db, sdk, ctx.request);
    const body = await ctx.request.json();
    const parsed = ApplyCartVoucherSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(JSON.stringify({
        success: false, error: 'Validation failed',
        fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])),
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    const { code } = parsed.data;
    const voucher = await getVoucherByCode(db, code);

    if (!voucher || !voucher.active) {
      return new Response(JSON.stringify({ success: false, error: 'Voucher not found or inactive' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    if (voucher.valid_from && now < new Date(voucher.valid_from)) {
      return new Response(JSON.stringify({ success: false, error: 'Voucher is not yet valid' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (voucher.valid_until && now > new Date(voucher.valid_until)) {
      return new Response(JSON.stringify({ success: false, error: 'Voucher has expired' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses) {
      return new Response(JSON.stringify({ success: false, error: 'Voucher usage limit reached' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await getCartWithItems(db, cart.id, 'RON');
    const items = result?.items ?? [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Cart is empty' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    const baseTotals = computeCartTotals(items as any, 'RON');
    if (voucher.min_order_value !== null && baseTotals.subtotal_net < voucher.min_order_value) {
      return new Response(JSON.stringify({ success: false, error: 'Minimum order value not met' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    let discountAmount = 0;
    if (voucher.type === 'fixed_amount') discountAmount = Math.min(voucher.value ?? 0, baseTotals.subtotal_net);
    else if (voucher.type === 'percentage') discountAmount = Math.round(baseTotals.subtotal_net * ((voucher.value ?? 0) / 100) * 100) / 100;

    await setCartVoucher(db, cart.id, voucher.code);
    const totals = computeCartTotals(items as any, 'RON', 0, discountAmount);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (setCookie) headers['Set-Cookie'] = setCookie;

    return new Response(JSON.stringify({
      success: true,
      data: { voucher: { code: voucher.code, type: voucher.type, value: voucher.value }, discount_amount: discountAmount, totals },
    }), { status: 200, headers });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const { cart, setCookie } = await getOrCreateCart(db, sdk, ctx.request);
    await setCartVoucher(db, cart.id, null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (setCookie) headers['Set-Cookie'] = setCookie;
    return new Response(JSON.stringify({ success: true, data: { voucher_removed: true } }), {
      status: 200, headers,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
