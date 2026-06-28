import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrCreateCart } from '../../../../../lib/cart-session';
import { updateCartItem, deleteCartItem, CartItemError } from '../../../../../lib/data/cart';
import { UpdateCartItemBodySchema } from '../../../../../schemas/cart.schema';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const PUT: APIRoute = (context) => { const sdk = createPluginContext(); return runPut({ db: sdk.db, sdk, ctx: context }); }

export const DELETE: APIRoute = (context) => { const sdk = createPluginContext(); return runDelete({ db: sdk.db, sdk, ctx: context }); }

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const { cart, setCookie } = await getOrCreateCart(db, sdk, ctx.request);
    const itemId = ctx.params.itemId;
    if (!itemId) {
      return new Response(JSON.stringify({ success: false, error: 'Item ID is required' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await ctx.request.json();
    const parsed = UpdateCartItemBodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({
        success: false, error: 'Validation failed',
        fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])),
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    const { quantity } = parsed.data;
    try {
      const result = await updateCartItem(db, cart.id, itemId, quantity);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (setCookie) headers['Set-Cookie'] = setCookie;
      return new Response(JSON.stringify({
        success: true, data: { item_id: itemId, quantity: quantity === 0 ? 0 : quantity, removed: result.removed },
      }), { status: 200, headers });
    } catch (e: any) {
      if (e instanceof CartItemError) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      throw e;
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const { cart, setCookie } = await getOrCreateCart(db, sdk, ctx.request);
    const itemId = ctx.params.itemId;
    if (!itemId) {
      return new Response(JSON.stringify({ success: false, error: 'Item ID is required' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      await deleteCartItem(db, cart.id, itemId);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (setCookie) headers['Set-Cookie'] = setCookie;
      return new Response(JSON.stringify({ success: true, data: { item_id: itemId, removed: true } }), {
        status: 200, headers,
      });
    } catch (e: any) {
      if (e instanceof CartItemError) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      throw e;
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
