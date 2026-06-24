import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listCategories } from '../../../../lib/data/products';
import { db } from 'astro:db';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const GET: APIRoute = (context) =>
  runGet({ db, sdk: createPluginContext(), ctx: context });

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const url = new URL(ctx.request.url);
    const locale = url.searchParams.get('locale') || 'ro';
    const cats = await listCategories(db, locale);
    return new Response(JSON.stringify({ success: true, data: cats }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
