import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  listProducts,
  getProductWithPrices,
  resolveProductBySlug,
  resolveCategoryBySlug,
  SlugCollisionError,
} from '../../../../lib/data/products';
import { getShopConfig } from '../../../../lib/data/settings';
import type { HandlerDeps } from '../../../../lib/handler-types';

function computeGross(
  priceNet: number,
  vatRate: number | null
): {
  price_net: number;
  price_gross: number;
  vat_amount: number;
} {
  const effectiveVatRate = vatRate ?? 0;
  const gross = Math.round(priceNet * (1 + effectiveVatRate) * 100) / 100;
  return {
    price_net: priceNet,
    price_gross: gross,
    vat_amount: Math.round((gross - priceNet) * 100) / 100,
  };
}

async function enrichProduct(
  db: any,
  p: any,
  locale: string,
  currency: string
): Promise<any | null> {
  const withPrices = await getProductWithPrices(db, p.id, locale);
  if (!withPrices) return null;
  const price = withPrices.prices.find((pr) => pr.currency === currency);
  if (!price) return null;
  return {
    id: p.id,
    sku: p.sku,
    name: withPrices.name,
    description: withPrices.description,
    slug: withPrices.slug,
    type: p.type,
    has_variants: p.has_variants,
    vat_rate: p.vat_rate,
    stock: p.stock,
    category_id: p.category_id,
    ...computeGross(price.price_net, p.vat_rate),
    currency,
  };
}

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

    // Slug resolution mode: return a single product.
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
      const enriched = await enrichProduct(db, result.product, locale, currency);
      if (!enriched) {
        return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, data: enriched }), {
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

    // List mode.
    const result = await listProducts(db, {
      page: 1,
      limit: 100,
      locale,
      category_id: resolvedCategoryId,
      active: true,
    });

    const enriched: any[] = [];
    for (const p of result.products) {
      const withPrices = await getProductWithPrices(db, p.id, locale);
      if (!withPrices) continue;
      const price = withPrices.prices.find((pr) => pr.currency === currency);
      if (!price) continue;
      enriched.push({
        id: p.id,
        sku: p.sku,
        name: withPrices.name,
        description: withPrices.description,
        slug: withPrices.slug,
        type: p.type,
        has_variants: p.has_variants,
        vat_rate: p.vat_rate,
        stock: p.stock,
        category_id: p.category_id,
        ...computeGross(price.price_net, p.vat_rate),
        currency,
      });
    }

    return new Response(JSON.stringify({ success: true, data: enriched }), {
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
