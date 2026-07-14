import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { UpdateAttributeSchema } from '../../../schemas/product.schema';
import {
  getAttribute,
  updateAttribute,
  deleteAttribute,
  AttributeUpdateConflictError,
} from '../../../lib/data/attributes';
import { getShopConfig } from '../../../lib/data/settings';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export const PUT: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPut({ db: sdk.db, sdk, ctx: context });
};

export const DELETE: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runDelete({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const id = ctx.params.id!;
    const url = new URL(ctx.request.url);
    const config = await getShopConfig(db);
    const locale = url.searchParams.get('locale') || config.defaultLocale;

    const data = await getAttribute(db, id, locale);
    if (!data) {
      return new Response(JSON.stringify({ success: false, error: 'Attribute not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
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

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const id = ctx.params.id!;
    const body = await ctx.request.json();
    const result = UpdateAttributeSchema.safeParse(body);

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

    const data = await updateAttribute(db, id, result.data);
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    if (err instanceof AttributeUpdateConflictError) {
      const status = err.code === 'not_found' ? 404 : 409;
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status,
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

    const id = ctx.params.id!;
    await deleteAttribute(db, id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    if (err instanceof AttributeUpdateConflictError) {
      const status = err.code === 'not_found' ? 404 : 409;
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status,
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
