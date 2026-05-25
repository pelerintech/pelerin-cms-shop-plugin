import type { APIRoute } from 'astro';
import { db, cart_items, sql as dbSql } from 'astro:db';
import { getOrCreateCart } from '../../../../../lib/cart-session.ts';

export const DELETE: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    // Delete all items for this cart
    await db.run(
      dbSql`DELETE FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cart.id}`
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (setCookie) {
      headers['Set-Cookie'] = setCookie;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          cart_id: cart.id,
          cleared: true,
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
};