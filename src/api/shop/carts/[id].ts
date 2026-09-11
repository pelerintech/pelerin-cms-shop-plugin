import type { AnyRow } from '../../../lib/types.ts';
import { errorFields } from '../../../lib/errors.ts';
import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getCartWithItems, deleteCart } from '../../../lib/data/cart';
import { computeCartTotals } from '../../../lib/cart-totals';
import { getShopConfig } from '../../../lib/data/settings';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export const DELETE: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runDelete({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const cartId = ctx.params.id!;
    const config = await getShopConfig(db);

    const result = await getCartWithItems(db, cartId, config.defaultCurrency);
    if (!result) {
      return new Response(JSON.stringify({ success: false, error: 'Cart not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const totals = computeCartTotals(result.items as AnyRow, config.defaultCurrency, 0, 0);
    const ageMs = Date.now() - new Date(result.cart.created_at).getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60 * 1000));

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: result.cart.id,
          session_id: result.cart.session_id,
          user_id: result.cart.user_id,
          applied_voucher_code: result.cart.applied_voucher_code,
          applied_referral_code: result.cart.applied_referral_code,
          items: totals.items,
          totals,
          age_hours: ageHours,
          created_at: result.cart.created_at,
          updated_at: result.cart.updated_at,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const status = errorFields(err).status ?? 500;
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const cartId = ctx.params.id!;
    await deleteCart(db, cartId);
    return new Response(JSON.stringify({ success: true, data: { id: cartId } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const status = errorFields(err).status ?? 500;
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
