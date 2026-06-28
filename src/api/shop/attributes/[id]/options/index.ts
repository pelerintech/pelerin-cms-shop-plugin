import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { CreateAttributeOptionSchema } from '../../../../../schemas/product.schema';
import { listOptions, createOption, OptionError } from '../../../../../lib/data/attribute-options';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const GET: APIRoute = (context) => { const sdk = createPluginContext(); return runGet({ db: sdk.db, sdk, ctx: context }); }

export const POST: APIRoute = (context) => { const sdk = createPluginContext(); return runPost({ db: sdk.db, sdk, ctx: context }); }

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const attributeId = ctx.params.id!;
    const url = new URL(ctx.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    const enriched = await listOptions(db, attributeId, locale);

    return new Response(
      JSON.stringify({ success: true, data: enriched }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (err instanceof OptionError && err.code === 'not_found') {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
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

    const attributeId = ctx.params.id!;
    const body = await ctx.request.json();
    const result = CreateAttributeOptionSchema.safeParse({ ...body, attribute_id: attributeId });

    if (!result.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(
            result.error.issues.map(i => [i.path.join('.'), i.message])
          ),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { value, sort_order } = result.data;
    const data = await createOption(db, attributeId, { value, sort_order });

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (err instanceof OptionError) {
      const status = err.code === 'not_found' ? 404 : 422;
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status, headers: { 'Content-Type': 'application/json' },
      });
    }
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
