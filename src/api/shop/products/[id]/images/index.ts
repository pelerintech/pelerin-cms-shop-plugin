import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, product_images } from 'astro:db';

export const POST: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const formData = await context.request.formData();
    const file = formData.get('file') as File;
    const alt = formData.get('alt') as string | null;

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'No file provided' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Upload via SDK storage
    const uploadResult = await sdk.storage.upload(file);
    const url = uploadResult.url || uploadResult.path;

    // Get current max sort_order for this product
    const existing = await db
      .select()
      .from(product_images)
      .where(eq(product_images.product_id, id));
    const maxSort = existing.reduce((max, img) => Math.max(max, img.sort_order), 0);

    const imageId = crypto.randomUUID();
    await db.insert(product_images).values({
      id: imageId,
      product_id: id,
      variant_id: null,
      url,
      alt: alt || null,
      sort_order: maxSort + 1,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: { id: imageId, product_id: id, url, alt, sort_order: maxSort + 1 },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};