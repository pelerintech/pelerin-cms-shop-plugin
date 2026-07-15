import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  listCategories,
  resolveCategoryBySlug,
  SlugCollisionError,
} from '../../../../lib/data/products';
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
    const slug = url.searchParams.get('slug');

    if (slug) {
      // Slug resolution mode: return a single category object.
      const result = await resolveCategoryBySlug(db, slug, locale);
      if (result === null) {
        return new Response(JSON.stringify({ success: false, error: 'Category not found' }), {
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
      return new Response(JSON.stringify({ success: true, data: result.category }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // List mode: return all categories.
    const cats = await listCategories(db, locale);
    return new Response(JSON.stringify({ success: true, data: cats }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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
