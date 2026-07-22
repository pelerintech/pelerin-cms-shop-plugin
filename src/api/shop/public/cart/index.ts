import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrCreateCart } from '../../../../lib/cart-session';
import { getCartWithItems } from '../../../../lib/data/cart';
import { computeCartTotals } from '../../../../lib/cart-totals';
import { getVoucherByCode } from '../../../../lib/data/vouchers';
import { getReferralByCode } from '../../../../lib/data/referrals';
import { getShopConfig } from '../../../../lib/data/settings';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const { cart, setCookie } = await getOrCreateCart(db, sdk, ctx.request);
    const url = new URL(ctx.request.url);
    const config = await getShopConfig(db);
    const currency = url.searchParams.get('currency') || config.defaultCurrency;

    const result = await getCartWithItems(db, cart.id, currency);
    const items = result?.items ?? [];

    let discountAmount = 0;
    let voucherResp: Record<string, any> | null = null;
    let referralResp: Record<string, any> | null = null;

    if (cart.applied_voucher_code) {
      const voucher = await getVoucherByCode(db, cart.applied_voucher_code);
      if (voucher && voucher.active) {
        const baseTotals = computeCartTotals(items as any, currency);
        let vDiscount = 0;
        if (voucher.type === 'fixed_amount')
          vDiscount = Math.min(voucher.value ?? 0, baseTotals.subtotal_net);
        else if (voucher.type === 'percentage')
          vDiscount =
            Math.round(baseTotals.subtotal_net * ((voucher.value ?? 0) / 100) * 100) / 100;
        discountAmount = vDiscount;
        voucherResp = {
          code: voucher.code,
          type: voucher.type,
          value: voucher.value,
          discount_amount: vDiscount,
        };
      } else {
        voucherResp = {
          code: cart.applied_voucher_code,
          type: null,
          value: null,
          discount_amount: 0,
        };
      }
    }

    if (cart.applied_referral_code) {
      const referral = await getReferralByCode(db, cart.applied_referral_code);
      if (referral && referral.active) {
        if (
          !cart.applied_voucher_code &&
          referral.discount_type &&
          referral.discount_value !== null
        ) {
          const baseTotals = computeCartTotals(items as any, currency);
          let rDiscount = 0;
          if (referral.discount_type === 'fixed_amount')
            rDiscount = Math.min(referral.discount_value, baseTotals.subtotal_net);
          else if (referral.discount_type === 'percentage')
            rDiscount =
              Math.round(baseTotals.subtotal_net * (referral.discount_value / 100) * 100) / 100;
          discountAmount = rDiscount;
          referralResp = {
            code: referral.code,
            discount_type: referral.discount_type,
            discount_value: referral.discount_value,
            discount_amount: rDiscount,
          };
        } else if (cart.applied_voucher_code) {
          // Both codes — voucher takes priority, referral is dormant
          referralResp = {
            code: referral.code,
            discount_type: referral.discount_type,
            discount_value: referral.discount_value,
            discount_amount: 0,
            superseded_by_voucher: true,
          };
        } else {
          // Tracking-only referral (active but no discount type/value)
          referralResp = {
            code: referral.code,
            discount_type: referral.discount_type,
            discount_value: referral.discount_value,
            discount_amount: 0,
          };
        }
      }
    }

    const totals = computeCartTotals(items as any, currency, 0, discountAmount);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (setCookie) headers['Set-Cookie'] = setCookie;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          cart_id: cart.id,
          session_id: cart.session_id,
          items: totals.items,
          totals,
          discount_amount: discountAmount,
          voucher: voucherResp,
          referral: referralResp,
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
}

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  return runGet({ db, sdk, ctx });
}
