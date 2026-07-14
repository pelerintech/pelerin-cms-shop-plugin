import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getOrCreateCart } from '../../../../../lib/cart-session';
import { addCartItem, CartItemError } from '../../../../../lib/data/cart';
import { AddCartItemBodySchema } from '../../../../../schemas/cart.schema';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const { cart, setCookie } = await getOrCreateCart(db, sdk, ctx.request);
    const body = await ctx.request.json();
    const parsed = AddCartItemBodySchema.safeParse(body);

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

    const { product_id, variant_id, quantity } = parsed.data;
    try {
      const item = await addCartItem(db, cart.id, {
        product_id,
        variant_id: variant_id || null,
        quantity,
      });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (setCookie) headers['Set-Cookie'] = setCookie;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            cart_id: cart.id,
            product_id,
            variant_id: variant_id || null,
            quantity: item.quantity,
          },
        }),
        { status: 200, headers }
      );
    } catch (e: any) {
      if (e instanceof CartItemError) {
        const codeMap: Record<string, number> = {
          not_found: 404,
          product_not_found: 404,
          out_of_stock: 409,
          insufficient_stock: 409,
          variant_required: 422,
        };
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: codeMap[e.code] ?? 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw e;
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
