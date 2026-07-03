import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrCreateCart } from '../../../../../lib/cart-session';
import { getCartWithItems, setCartReferral } from '../../../../../lib/data/cart';
import { getReferralByCode } from '../../../../../lib/data/referrals';
import { computeCartTotals } from '../../../../../lib/cart-totals';
import { getShopConfig } from '../../../../../lib/data/settings';
import { ApplyCartReferralSchema } from '../../../../../schemas/cart.schema';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const POST: APIRoute = (context) => { const sdk = createPluginContext(); return runPost({ db: sdk.db, sdk, ctx: context }); }

export const DELETE: APIRoute = (context) => { const sdk = createPluginContext(); return runDelete({ db: sdk.db, sdk, ctx: context }); }

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const { cart, setCookie } = await getOrCreateCart(db, sdk, ctx.request);
    const config = await getShopConfig(db);
    const body = await ctx.request.json();
    const parsed = ApplyCartReferralSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(JSON.stringify({
        success: false, error: 'Validation failed',
        fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])),
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    const { code } = parsed.data;
    const referral = await getReferralByCode(db, code);
    if (!referral || !referral.active) {
      return new Response(JSON.stringify({ success: false, error: 'Referral code not found or inactive' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await getCartWithItems(db, cart.id, config.defaultCurrency);
    const items = result?.items ?? [];

    let discountAmount = 0;
    if (referral.discount_type && referral.discount_value !== null) {
      const baseTotals = computeCartTotals(items as any, config.defaultCurrency);
      if (referral.discount_type === 'fixed_amount') discountAmount = Math.min(referral.discount_value, baseTotals.subtotal_net);
      else if (referral.discount_type === 'percentage') discountAmount = Math.round(baseTotals.subtotal_net * (referral.discount_value / 100) * 100) / 100;
    }

    await setCartReferral(db, cart.id, referral.code);
    const totals = computeCartTotals(items as any, config.defaultCurrency, 0, discountAmount);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (setCookie) headers['Set-Cookie'] = setCookie;

    return new Response(JSON.stringify({
      success: true,
      data: {
        referral: { code: referral.code, name: referral.name, discount_type: referral.discount_type, discount_value: referral.discount_value },
        discount_amount: discountAmount, totals,
      },
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
    await setCartReferral(db, cart.id, null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (setCookie) headers['Set-Cookie'] = setCookie;
    return new Response(JSON.stringify({ success: true, data: { referral_removed: true } }), {
      status: 200, headers,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
