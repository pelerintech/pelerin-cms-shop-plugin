import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listCategories } from '../../../../lib/data/products';
import { getShopConfig } from '../../../../lib/data/settings';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const GET: APIRoute = (context) => { const sdk = createPluginContext(); return runGet({ db: sdk.db, sdk, ctx: context }); }

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const url = new URL(ctx.request.url);
    const config = await getShopConfig(db);
    const locale = url.searchParams.get('locale') || config.defaultLocale;
    const cats = await listCategories(db, locale);
    return new Response(JSON.stringify({ success: true, data: cats }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
