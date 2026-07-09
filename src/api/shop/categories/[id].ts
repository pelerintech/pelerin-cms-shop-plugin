import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getCategoryById, updateCategory, updateCategoryWithTranslations, deleteCategory, SlugCollisionError } from '../../../lib/data/products';
import { getShopConfig } from '../../../lib/data/settings';
import { UpdateCategorySchema } from '../../../schemas/category.schema';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => { const sdk = createPluginContext(); return runGet({ db: sdk.db, sdk, ctx: context }); }

export const PUT: APIRoute = (context) => { const sdk = createPluginContext(); return runPut({ db: sdk.db, sdk, ctx: context }); }

export const DELETE: APIRoute = (context) => { const sdk = createPluginContext(); return runDelete({ db: sdk.db, sdk, ctx: context }); }

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const cat = await getCategoryById(db, ctx.params.id!);
    if (!cat) return new Response(JSON.stringify({ success: false, error: 'Category not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, data: cat }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    const parsed = UpdateCategorySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ success: false, error: 'Validation failed', fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])) }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    const config = await getShopConfig(db);
    const knownLocaleCodes = new Set(config.locales.filter(l => !l.isDefault).map(l => l.code));
    await updateCategoryWithTranslations(db, ctx.params.id!, parsed.data, body, knownLocaleCodes);
    return new Response(JSON.stringify({ success: true, data: { id: ctx.params.id, ...parsed.data } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    if (err instanceof SlugCollisionError) {
      return new Response(JSON.stringify({ success: false, error: 'Validation failed', fields: { [`slug_${err.locale}`]: err.message } }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    await deleteCategory(db, ctx.params.id!);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
