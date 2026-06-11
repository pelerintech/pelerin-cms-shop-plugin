import type { APIRoute } from 'astro';
import { db, cart_items, products, product_variants, sql as dbSql } from 'astro:db';
import { getOrCreateCart } from '../../../../../lib/cart-session'
import { AddCartItemBodySchema } from '../../../../../schemas/cart.schema'

export const POST: APIRoute = async (context) => {
  try {
    const { cart, sessionId, setCookie } = await getOrCreateCart(context.request);

    const body = await context.request.json();
    const parsed = AddCartItemBodySchema.safeParse(body);

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

    const { product_id, variant_id, quantity: qty } = parsed.data;

    // Validate product exists and is active
    const productResult = await db.run(
      dbSql`SELECT * FROM ${products} WHERE ${products.id} = ${product_id} LIMIT 1`
    );
    if (productResult.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const product = productResult.rows[0] as any;
    if (!product.active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product not available' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Determine stock source
    let availableStock: number | null = null;

    if (variant_id) {
      // Stock from variant
      const variantResult = await db.run(
        dbSql`SELECT * FROM ${product_variants} WHERE ${product_variants.id} = ${variant_id} AND ${product_variants.product_id} = ${product_id} LIMIT 1`
      );
      if (variantResult.rows.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Variant not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const variant = variantResult.rows[0] as any;
      if (!variant.active) {
        return new Response(
          JSON.stringify({ success: false, error: 'Variant not available' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      availableStock = variant.stock;
    } else if (!product.has_variants) {
      // Direct product stock (simple product)
      availableStock = product.stock;
    } else {
      // Product has variants but no variant_id provided
      return new Response(
        JSON.stringify({ success: false, error: 'variant_id is required for this product' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check existing cart item for same product/variant
    const existingResult = await db.run(
      dbSql`SELECT * FROM ${cart_items} WHERE ${cart_items.cart_id} = ${cart.id} AND ${cart_items.product_id} = ${product_id} AND (${cart_items.variant_id} = ${variant_id || null} OR (${cart_items.variant_id} IS NULL AND ${variant_id || null} IS NULL)) LIMIT 1`
    );
    const existingItem = existingResult.rows[0] as any;
    const existingQty = existingItem ? existingItem.quantity : 0;

    // Stock validation
    if (availableStock !== null) {
      if (availableStock <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Out of stock' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const totalRequested = existingQty + qty;
      if (totalRequested > availableStock) {
        return new Response(
          JSON.stringify({ success: false, error: 'Insufficient stock' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert or update
    if (existingItem) {
      await db.run(
        dbSql`UPDATE ${cart_items} SET ${cart_items.quantity} = ${existingQty + qty} WHERE ${cart_items.id} = ${existingItem.id}`
      );
    } else {
      await db.insert(cart_items).values({
        id: crypto.randomUUID(),
        cart_id: cart.id,
        product_id,
        variant_id: variant_id || null,
        quantity: qty,
      });
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
          cart_id: cart.id,
          product_id,
          variant_id: variant_id || null,
          quantity: existingItem ? existingQty + qty : qty,
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