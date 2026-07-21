import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listProducts, createProduct } from '../../../lib/data/products';
import { getShopConfig } from '../../../lib/data/settings';
import { CreateProductSchema } from '../../../schemas/product.schema';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const url = new URL(ctx.request.url);
    const config = await getShopConfig(db);
    const result = await listProducts(db, {
      page: parseInt(url.searchParams.get('page') ?? '1') || 1,
      limit: parseInt(url.searchParams.get('limit') ?? '20') || 20,
      locale: url.searchParams.get('locale') || config.defaultLocale,
      defaultLocale: config.defaultLocale,
      category_id: url.searchParams.get('category_id') ?? undefined,
      active:
        url.searchParams.get('active') !== null
          ? url.searchParams.get('active') === 'true'
          : undefined,
      search: url.searchParams.get('search') ?? undefined,
    });
    return new Response(
      JSON.stringify({
        success: true,
        data: result.products,
        total: result.total,
        page: result.page,
        limit: result.limit,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    const parsed = CreateProductSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const id = await createProduct(db, parsed.data);
    return new Response(JSON.stringify({ success: true, data: { id, ...parsed.data } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
