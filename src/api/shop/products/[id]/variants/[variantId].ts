import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { UpdateVariantSchema } from '../../../../../schemas/product.schema';
import { updateVariant, deleteVariant, VariantError } from '../../../../../lib/data/variants';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const PUT: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPut({ db: sdk.db, sdk, ctx: context });
};

export const DELETE: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runDelete({ db: sdk.db, sdk, ctx: context });
};

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const { variantId } = ctx.params;

    const body = await ctx.request.json();

    const input: {
      sku?: string | null;
      stock?: number | null;
      active?: boolean;
      field_values?: any[];
      prices?: { currency: string; price_net: number | null }[];
    } = {};
    const variantResult = UpdateVariantSchema.safeParse(body);
    if (variantResult.success) {
      if (body.sku !== undefined) input.sku = body.sku;
      if (body.stock !== undefined) input.stock = body.stock;
      if (body.active !== undefined) input.active = body.active;
    }
    if (body.field_values && Array.isArray(body.field_values)) {
      input.field_values = body.field_values;
    }
    if (body.prices && Array.isArray(body.prices)) {
      input.prices = body.prices;
    }

    const updated = await updateVariant(db, variantId!, input);

    return new Response(JSON.stringify({ success: true, data: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    if (err instanceof VariantError) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 404,
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

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const { variantId } = ctx.params;

    await deleteVariant(db, variantId!);

    return new Response(JSON.stringify({ success: true, data: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    if (err instanceof VariantError) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 404,
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
