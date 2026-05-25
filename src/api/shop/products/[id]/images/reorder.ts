import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, product_images } from 'astro:db';

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const body = await context.request.json();

    if (!Array.isArray(body.order)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payload: order must be an array' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Update sort_order for each image
    for (const item of body.order) {
      if (item.id && typeof item.sort_order === 'number') {
        await db
          .update(product_images)
          .set({ sort_order: item.sort_order })
          .where(eq(product_images.id, item.id));
      }
    }

    // Return updated images
    const updated = await db
      .select()
      .from(product_images)
      .where(eq(product_images.product_id, id))
      .orderBy(product_images.sort_order);

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