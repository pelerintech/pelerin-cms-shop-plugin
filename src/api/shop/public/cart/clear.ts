import type { APIRoute } from 'astro';
import { db } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrCreateCart } from '../../../../lib/cart-session';
import { clearCart } from '../../../../lib/data/cart';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const DELETE: APIRoute = (context) =>
  runDelete({ db, sdk: createPluginContext(), ctx: context });

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const { cart, setCookie } = await getOrCreateCart(db, sdk, ctx.request);
    await clearCart(db, cart.id);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (setCookie) headers['Set-Cookie'] = setCookie;

    return new Response(JSON.stringify({ success: true, data: { cart_id: cart.id, cleared: true } }), {
      status: 200, headers,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
