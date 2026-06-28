import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { listPricesForProduct, listPricesForVariant, upsertPrice, deletePrice } from '../../../../lib/data/products';
import { listVariantIdsForProduct } from '../../../../lib/data/variants';
import { BulkUpsertPricesSchema, CreatePriceSchema } from '../../../../schemas/product.schema';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const GET: APIRoute = (context) =>
  runGet({ db, sdk: createPluginContext(), ctx: context });

export const POST: APIRoute = (context) =>
  runPost({ db, sdk: createPluginContext(), ctx: context });

export const PUT: APIRoute = (context) =>
  runPut({ db, sdk: createPluginContext(), ctx: context });

export const DELETE: APIRoute = (context) =>
  runDelete({ db, sdk: createPluginContext(), ctx: context });

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const productId = ctx.params.id!;
    const prices = await listPricesForProduct(db, productId);
    const variantIds = await listVariantIdsForProduct(db, productId);
    const variantPrices: any[] = [];
    for (const vid of variantIds) {
      const vp = await listPricesForVariant(db, vid);
      variantPrices.push(...vp);
    }
    return new Response(JSON.stringify({ success: true, data: [...prices, ...variantPrices] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    // A variant-level price has product_id = null (variant_id set); a product-level
    // price has product_id = the path param (variant_id null). CreatePriceSchema's
    // superRefine enforces exactly-one-of — so we set product_id = null when a
    // variant_id is provided.
    const parsed = CreatePriceSchema.safeParse({
      product_id: body.variant_id ? null : ctx.params.id!,
      variant_id: body.variant_id ?? null,
      currency: body.currency,
      price_net: body.price_net,
    });
    if (!parsed.success) {
      return new Response(JSON.stringify({ success: false, error: 'Validation failed', fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])) }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    await upsertPrice(db, { product_id: parsed.data.product_id, variant_id: parsed.data.variant_id ?? null, currency: parsed.data.currency, price_net: parsed.data.price_net });
    return new Response(JSON.stringify({ success: true, data: parsed.data }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    // Accept either { prices: [...] } (bulk) or a single price object.
    const payload = Array.isArray(body?.prices) ? { prices: body.prices } : { prices: [body] };
    // Normalize product_id from the route when missing.
    payload.prices = payload.prices.map((p: any) => ({
      ...p,
      product_id: p.product_id ?? ctx.params.id!,
    }));
    const parsed = BulkUpsertPricesSchema.safeParse(payload);
    if (!parsed.success) {
      return new Response(JSON.stringify({ success: false, error: 'Validation failed', fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])) }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    for (const p of parsed.data.prices) {
      await upsertPrice(db, {
        product_id: p.product_id,
        variant_id: p.variant_id ?? null,
        currency: p.currency,
        price_net: p.price_net,
      });
    }
    return new Response(JSON.stringify({ success: true, data: parsed.data.prices }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const url = new URL(ctx.request.url);
    const priceId = url.searchParams.get('id');
    if (priceId) await deletePrice(db, priceId);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
};
