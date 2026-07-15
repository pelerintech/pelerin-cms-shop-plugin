import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listVariants, createVariants, VariantError } from '../../../../../lib/data/variants';
import { getShopConfig } from '../../../../../lib/data/settings';
import type { HandlerDeps } from '../../../../../lib/handler-types';

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
    const productId = ctx.params.id!;
    const url = new URL(ctx.request.url);
    const config = await getShopConfig(db);
    const locale = url.searchParams.get('locale') || config.defaultLocale;

    const enriched = await listVariants(db, productId, locale);

    return new Response(JSON.stringify({ success: true, data: enriched }), {
      status: 200,
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

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const productId = ctx.params.id!;

    const body = await ctx.request.json();
    if (!body.combinations || !Array.isArray(body.combinations)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: { combinations: 'combinations array is required' },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }
    for (let i = 0; i < body.combinations.length; i++) {
      const combo = body.combinations[i];
      if (!combo.option_ids || !Array.isArray(combo.option_ids) || combo.option_ids.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Validation failed',
            fields: {
              [`combinations.${i}.option_ids`]: 'Each combination must have at least one option_id',
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const createdVariants = await createVariants(db, productId, body.combinations);

    return new Response(JSON.stringify({ success: true, data: createdVariants }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    if (err instanceof VariantError && err.code === 'duplicate_combination') {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
