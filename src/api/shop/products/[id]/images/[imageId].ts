import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { deleteProductImage } from '../../../../../lib/data/products';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const DELETE: APIRoute = (context) =>
  runDelete({ db, sdk: createPluginContext(), ctx: context });

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    await deleteProductImage(db, sdk, ctx.params.imageId!);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
}
