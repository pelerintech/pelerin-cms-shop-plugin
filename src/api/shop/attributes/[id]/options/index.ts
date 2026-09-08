import { errorFields } from '../../../../../lib/errors.ts';
import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { CreateAttributeOptionSchema } from '../../../../../schemas/product.schema';
import { listOptions, createOption, OptionError } from '../../../../../lib/data/attribute-options';
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

    const attributeId = ctx.params.id!;
    const url = new URL(ctx.request.url);
    const config = await getShopConfig(db);
    const locale = url.searchParams.get('locale') || config.defaultLocale;

    const enriched = await listOptions(db, attributeId, locale);

    return new Response(JSON.stringify({ success: true, data: enriched }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    if (err instanceof OptionError && errorFields(err).code === 'not_found') {
      return new Response(JSON.stringify({ success: false, error: errorFields(err).message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const status = errorFields(err).status ?? 500;
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const attributeId = ctx.params.id!;
    const body = await ctx.request.json();
    const result = CreateAttributeOptionSchema.safeParse({ ...body, attribute_id: attributeId });

    if (!result.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message])),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { value, sort_order, label, translations } = result.data;
    const data = await createOption(db, attributeId, { value, sort_order, label, translations });

    return new Response(JSON.stringify({ success: true, data }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    if (err instanceof OptionError) {
      const code = errorFields(err).code;
      const status = code === 'not_found' ? 404 : code === 'duplicate_value' ? 409 : 422;
      return new Response(JSON.stringify({ success: false, error: errorFields(err).message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const status = errorFields(err).status ?? 500;
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
