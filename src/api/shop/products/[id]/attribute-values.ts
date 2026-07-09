import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  listProductAttributeValues,
  upsertProductAttributeValue,
  AttributeValueError,
} from '../../../../lib/data/attribute-values';
import { getShopConfig } from '../../../../lib/data/settings';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const GET: APIRoute = (context) => { const sdk = createPluginContext(); return runGet({ db: sdk.db, sdk, ctx: context }); }

export const PUT: APIRoute = (context) => { const sdk = createPluginContext(); return runPut({ db: sdk.db, sdk, ctx: context }); }

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const productId = ctx.params.id!;
    const url = new URL(ctx.request.url);
    const config = await getShopConfig(db);
    const locale = url.searchParams.get('locale') || config.defaultLocale;

    const enriched = await listProductAttributeValues(db, productId, locale);

    return new Response(
      JSON.stringify({ success: true, data: enriched }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const productId = ctx.params.id!;

    const body = await ctx.request.json();

    if (!body.values || !Array.isArray(body.values)) {
      return new Response(
        JSON.stringify({ success: false, error: 'values array is required' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    for (const val of body.values) {
      const { assignment_id, option_id, value_text, value_number, value_boolean } = val;
      try {
        await upsertProductAttributeValue(db, {
          entity_type: 'product',
          entity_id: productId,
          assignment_id,
          option_id,
          value_text,
          value_number,
          value_boolean,
        });
      } catch (e: any) {
        if (e instanceof AttributeValueError) {
          return new Response(
            JSON.stringify({ success: false, error: e.message }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw e;
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
