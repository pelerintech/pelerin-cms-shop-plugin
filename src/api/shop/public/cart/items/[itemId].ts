import type { APIRoute } from 'astro';
import { db, cart_items, sql as dbSql } from 'astro:db';
import { getOrCreateCart } from '../../../../lib/cart-session.ts';
import { UpdateCartItemBodySchema } from '../../../../schemas/cart.schema.ts';

export const PUT: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    const itemId = context.params.itemId;
    if (!itemId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Item ID is required' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await context.request.json();
    const parsed = UpdateCartItemBodySchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(
            parsed.error.issues.map(i => [i.path.join('.'), i.message])
          ),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { quantity } = parsed.data;

    // Verify item belongs to this cart
    const existingResult = await db.run(
      dbSql`SELECT * FROM ${cart_items} WHERE ${cart_items.id} = ${itemId} AND ${cart_items.cart_id} = ${cart.id} LIMIT 1`
    );

    if (existingResult.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cart item not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (quantity === 0) {
      // Remove item when quantity is 0
      await db.run(
        dbSql`DELETE FROM ${cart_items} WHERE ${cart_items.id} = ${itemId}`
      );
    } else {
      // Update quantity
      await db.run(
        dbSql`UPDATE ${cart_items} SET ${cart_items.quantity} = ${quantity} WHERE ${cart_items.id} = ${itemId}`
      );
    }

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
          item_id: itemId,
          quantity: quantity === 0 ? 0 : quantity,
          removed: quantity === 0,
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

export const DELETE: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    const itemId = context.params.itemId;
    if (!itemId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Item ID is required' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify item belongs to this cart
    const existingResult = await db.run(
      dbSql`SELECT * FROM ${cart_items} WHERE ${cart_items.id} = ${itemId} AND ${cart_items.cart_id} = ${cart.id} LIMIT 1`
    );

    if (existingResult.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cart item not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Remove item
    await db.run(
      dbSql`DELETE FROM ${cart_items} WHERE ${cart_items.id} = ${itemId}`
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
          item_id: itemId,
          removed: true,
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