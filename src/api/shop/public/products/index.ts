import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  listProducts,
  resolveProductBySlug,
  resolveCategoryBySlug,
  SlugCollisionError,
} from '../../../../lib/data/products';
import { batchEnrichPublicProducts } from '../../../../lib/data/public-products';
import { getShopConfig } from '../../../../lib/data/settings';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const url = new URL(ctx.request.url);
    const config = await getShopConfig(db);
    const locale = url.searchParams.get('locale') || config.defaultLocale;
    const currency = url.searchParams.get('currency') || config.defaultCurrency;
    const slug = url.searchParams.get('slug');
    const categorySlug = url.searchParams.get('categorySlug');
    const categoryId = url.searchParams.get('categoryId') || undefined;

    // Slug resolution mode: return a single enriched product.
    if (slug) {
      const result = await resolveProductBySlug(db, slug, locale);
      if (result === null) {
        return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (result instanceof SlugCollisionError) {
        return new Response(
          JSON.stringify({ success: false, error: `Slug collision: ${result.message}` }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const enriched = await batchEnrichPublicProducts(db, [result.product], { currency, sdk });
      if (enriched.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, data: enriched[0] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Category slug resolution: resolve slug → id, then list products.
    let resolvedCategoryId = categoryId;
    if (categorySlug && !categoryId) {
      const catResult = await resolveCategoryBySlug(db, categorySlug, locale);
      if (catResult === null) {
        return new Response(JSON.stringify({ success: false, error: 'Category not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (catResult instanceof SlugCollisionError) {
        return new Response(
          JSON.stringify({ success: false, error: `Slug collision: ${catResult.message}` }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      resolvedCategoryId = catResult.category.id;
    }

    // Pagination params (default page=1, limit=20, max 100).
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20') || 20));

    // List mode with pagination.
    const result = await listProducts(db, {
      page,
      limit,
      locale,
      defaultLocale: config.defaultLocale,
      category_id: resolvedCategoryId,
      active: true,
    });

    const enriched = await batchEnrichPublicProducts(db, result.products, { currency, sdk });

    return new Response(
      JSON.stringify({
        success: true,
        data: enriched,
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
    if (err instanceof SlugCollisionError) {
      return new Response(
        JSON.stringify({ success: false, error: `Slug collision: ${err.message}` }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
