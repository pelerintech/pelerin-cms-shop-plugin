import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getLocales, saveLocales, getShopConfig, deleteSetting } from '../../../lib/data/settings';
import { LocalesSchema } from '../../../schemas/locales-currency.schema';
import { migrateDefaultLocale } from '../../../lib/data/migrate-default-locale';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};
export const PUT: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPut({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const locales = await getLocales(db);

  return new Response(JSON.stringify({ success: true, data: locales }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = LocalesSchema.safeParse(body.locales);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Validation failed',
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const oldConfig = await getShopConfig(db);
  const oldDefault = oldConfig.locales.find((l) => l.isDefault)?.code ?? oldConfig.defaultLocale;
  const newDefault = parsed.data.find((l) => l.isDefault)?.code;

  await saveLocales(db, parsed.data);

  // If the default locale changed, trigger data migration
  if (newDefault && oldDefault && newDefault !== oldDefault) {
    await migrateDefaultLocale(db, oldDefault, newDefault);
  }

  // Delete the old default_locale key (migration function handles this too, but be explicit)
  await deleteSetting(db, 'default_locale');

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
