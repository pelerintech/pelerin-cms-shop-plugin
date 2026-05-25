import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, product_images } from 'astro:db';

export const DELETE: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id, imageId } = context.params;

    const [image] = await db
      .select()
      .from(product_images)
      .where(eq(product_images.id, imageId));

    if (!image) {
      return new Response(JSON.stringify({ success: false, error: 'Image not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete from storage
    try {
      await sdk.storage.delete(image.url);
    } catch {
      // Non-fatal: storage deletion may fail independently
    }

    // Delete from DB
    await db.delete(product_images).where(eq(product_images.id, imageId));

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