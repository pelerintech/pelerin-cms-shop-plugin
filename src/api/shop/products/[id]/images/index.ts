import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listProductImage, createProductImage } from '../../../../../lib/data/products';
import { buildProductImageKey } from '../../../../../lib/storage-keys';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const GET: APIRoute = (context) => { const sdk = createPluginContext(); return runGet({ db: sdk.db, sdk, ctx: context }); }

export const POST: APIRoute = (context) => { const sdk = createPluginContext(); return runPost({ db: sdk.db, sdk, ctx: context }); }

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const images = await listProductImage(db, sdk, ctx.params.id!);
    return new Response(JSON.stringify({ success: true, data: images }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const productId = ctx.params.id!;
    // Multipart upload (design D6): read `file` from FormData.
    const fd = await ctx.request.formData();
    const file = fd.get('file');
    if (!(file instanceof Blob)) {
      return new Response(JSON.stringify({ success: false, error: 'Validation failed', fields: { file: 'file is required' } }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const key = buildProductImageKey(productId, (file as any).name || 'upload.bin');
    const mime = file.type || 'application/octet-stream';
    // Storage-before-DB (design D7): if upload throws, return 5xx and write NOTHING.
    const up = await sdk.storage.upload(buf, key, mime);
    const id = await createProductImage(db, {
      product_id: productId,
      storage_key: key,
      mime,
      size: buf.length,
      width: up.width ?? null,
      height: up.height ?? null,
      original_filename: (file as any).name ?? null,
      alt: null,
      sort_order: 0,
    });
    const resolvedUrl = up.url ?? sdk.storage.getUrl(key);
    return new Response(JSON.stringify({ success: true, data: { id, url: resolvedUrl, key } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
}
