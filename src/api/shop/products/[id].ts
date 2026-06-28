import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getProductWithPrices, updateProduct, deleteProduct } from '../../../lib/data/products';
import { UpdateProductSchema } from '../../../schemas/product.schema';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => { const sdk = createPluginContext(); return runGet({ db: sdk.db, sdk, ctx: context }); }

export const PUT: APIRoute = (context) => { const sdk = createPluginContext(); return runPut({ db: sdk.db, sdk, ctx: context }); }

export const DELETE: APIRoute = (context) => { const sdk = createPluginContext(); return runDelete({ db: sdk.db, sdk, ctx: context }); }

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const url = new URL(ctx.request.url);
    const locale = url.searchParams.get('locale') || 'ro';
    const product = await getProductWithPrices(db, ctx.params.id!, locale);
    if (!product) return new Response(JSON.stringify({ success: false, error: 'Product not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, data: product }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    const parsed = UpdateProductSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ success: false, error: 'Validation failed', fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])) }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    await updateProduct(db, ctx.params.id!, parsed.data);
    return new Response(JSON.stringify({ success: true, data: { id: ctx.params.id, ...parsed.data } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    await deleteProduct(db, ctx.params.id!);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
