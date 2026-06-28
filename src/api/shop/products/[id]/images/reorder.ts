import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { reorderProductImages } from '../../../../../lib/data/products';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const PUT: APIRoute = (context) => { const sdk = createPluginContext(); return runPut({ db: sdk.db, sdk, ctx: context }); }

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    if (!Array.isArray(body.image_ids)) {
      return new Response(JSON.stringify({ success: false, error: 'image_ids array is required' }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    await reorderProductImages(db, body.image_ids);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
}
