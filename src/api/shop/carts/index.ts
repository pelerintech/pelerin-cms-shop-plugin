import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { listCarts, getCartWithItems, getCartItemCount } from '../../../lib/data/cart';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) =>
  runGet({ db, sdk: createPluginContext(), ctx: context });

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const url = new URL(ctx.request.url);
    const abandonedSince = url.searchParams.get('abandoned_since');
    const userIdFilter = url.searchParams.get('user_id');

    const cartList = await listCarts(db, {
      abandonedSinceHours: abandonedSince ? parseInt(abandonedSince) : undefined,
      userId: userIdFilter ?? undefined,
    });

    const enriched = [];
    for (const cart of cartList) {
      const counts = await getCartItemCount(db, cart.id);
      const withItems = await getCartWithItems(db, cart.id, 'RON');
      let totalValue = 0;
      if (withItems) {
        for (const item of withItems.items) {
          const priceGross = item.price_net * (1 + (item.vat_rate ?? 0));
          totalValue += Math.round(priceGross * item.quantity * 100) / 100;
        }
      }
      const ageMs = Date.now() - new Date(cart.created_at).getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60 * 1000));
      enriched.push({
        id: cart.id, session_id: cart.session_id, user_id: cart.user_id,
        item_count: counts.item_count, total_quantity: counts.total_quantity,
        total_value: totalValue, applied_voucher_code: cart.applied_voucher_code,
        applied_referral_code: cart.applied_referral_code, created_at: cart.created_at,
        updated_at: cart.updated_at, age_hours: ageHours,
      });
    }

    return new Response(JSON.stringify({ success: true, data: enriched }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status, headers: { 'Content-Type': 'application/json' },
    });
  }
}
