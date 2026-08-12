import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrCreateCart } from '../../../../lib/cart-session';
import { getCartWithItems } from '../../../../lib/data/cart';
import { computeCartTotals } from '../../../../lib/cart-totals';
import { evaluateCartDiscount } from '../../../../lib/cart-discount';
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

    // Single shared discount evaluation — same status + math checkout uses
    const evalResult = await evaluateCartDiscount(db, cart, items, currency);
    const discountAmount = evalResult.discount_amount;

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
          voucher: evalResult.voucher,
          referral: evalResult.referral,
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
