import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, product_variants, product_variant_option_values, product_prices } from 'astro:db';

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { variantId } = context.params;

    const [existing] = await db
      .select()
      .from(product_variants)
      .where(eq(product_variants.id, variantId));

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Variant not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const updateData: Record<string, any> = {};
    if (body.sku !== undefined) updateData.sku = body.sku;
    if (body.stock !== undefined) updateData.stock = body.stock;
    if (body.active !== undefined) updateData.active = body.active;

    if (Object.keys(updateData).length > 0) {
      await db
        .update(product_variants)
        .set(updateData)
        .where(eq(product_variants.id, variantId));
    }

    const [updated] = await db
      .select()
      .from(product_variants)
      .where(eq(product_variants.id, variantId));

    return new Response(JSON.stringify({ success: true, data: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { variantId } = context.params;

    const [existing] = await db
      .select()
      .from(product_variants)
      .where(eq(product_variants.id, variantId));

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Variant not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete variant option values first
    await db
      .delete(product_variant_option_values)
      .where(eq(product_variant_option_values.variant_id, variantId));

    // Delete variant prices
    await db
      .delete(product_prices)
      .where(eq(product_prices.variant_id, variantId));

    // Delete the variant
    await db
      .delete(product_variants)
      .where(eq(product_variants.id, variantId));

    return new Response(JSON.stringify({ success: true, data: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};