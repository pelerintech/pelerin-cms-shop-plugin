import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { listProducts, getProductWithPrices } from '../../../../lib/data/products';
import type { HandlerDeps } from '../../../../lib/handler-types';

function computeGross(priceNet: number, vatRate: number | null): {
  price_net: number; price_gross: number; vat_amount: number;
} {
  const effectiveVatRate = vatRate ?? 0;
  const gross = Math.round(priceNet * (1 + effectiveVatRate) * 100) / 100;
  return { price_net: priceNet, price_gross: gross, vat_amount: Math.round((gross - priceNet) * 100) / 100 };
}

export const GET: APIRoute = (context) =>
  runGet({ db, sdk: createPluginContext(), ctx: context });

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const url = new URL(ctx.request.url);
    const locale = url.searchParams.get('locale') || 'ro';
    const currency = url.searchParams.get('currency') || 'RON';
    const category_id = url.searchParams.get('category_id') || undefined;

    const result = await listProducts(db, { page: 1, limit: 100, locale, category_id, active: true });

    const enriched = [];
    for (const p of result.products) {
      const withPrices = await getProductWithPrices(db, p.id, locale);
      if (!withPrices) continue;
      const price = withPrices.prices.find(pr => pr.currency === currency);
      if (!price) continue;
      enriched.push({
        id: p.id, sku: p.sku, name: p.name, slug: p.slug, type: p.type,
        has_variants: p.has_variants, vat_rate: p.vat_rate, stock: p.stock,
        category_id: p.category_id, ...computeGross(price.price_net, p.vat_rate),
        currency,
      });
    }

    return new Response(JSON.stringify({ success: true, data: enriched }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
