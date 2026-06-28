import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { getTranslation, upsertTranslation, deleteTranslation } from '../../../../../lib/data/products';
import { UpsertProductTranslationSchema } from '../../../../../schemas/product.schema';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const GET: APIRoute = (context) =>
  runGet({ db, sdk: createPluginContext(), ctx: context });

export const PUT: APIRoute = (context) =>
  runPut({ db, sdk: createPluginContext(), ctx: context });

export const DELETE: APIRoute = (context) =>
  runDelete({ db, sdk: createPluginContext(), ctx: context });

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const t = await getTranslation(db, 'product', ctx.params.id!, ctx.params.locale!);
    return new Response(JSON.stringify({ success: true, data: t }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    const parsed = UpsertProductTranslationSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ success: false, error: 'Validation failed', fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])) }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    // Path params ALWAYS win — body entity_id/entity_type/locale are ignored.
    await upsertTranslation(db, {
      entity_type: 'product',
      entity_id: ctx.params.id!,
      locale: ctx.params.locale!,
      name: parsed.data.name ?? null,
      description: parsed.data.description ?? null,
      slug: parsed.data.slug ?? null,
      label: parsed.data.label ?? null,
    });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    await deleteTranslation(db, 'product', ctx.params.id!, ctx.params.locale!);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
  }
}
