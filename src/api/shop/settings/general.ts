import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  getSetting,
  upsertSettingTyped,
  getShopConfig,
  deleteSetting,
} from '../../../lib/data/settings';
import { z } from 'zod';
import type { HandlerDeps } from '../../../lib/handler-types';

const SETTINGS_KEYS = [
  'shop_name',
  'order_number_prefix',
  'order_number_year',
  'order_number_padding',
];

const GeneralSettingsSchema = z.object({
  shop_name: z.string().optional(),
  order_number_prefix: z.string().optional(),
  order_number_year: z.boolean().optional(),
  order_number_padding: z.number().int().min(1).optional(),
});

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

  const settings: Record<string, any> = {};
  for (const key of SETTINGS_KEYS) {
    settings[key] = await getSetting(db, key);
  }
  const config = await getShopConfig(db);
  settings.locales = config.locales;
  settings.currencies = config.currencies;
  settings.defaultLocale = config.defaultLocale;
  settings.defaultCurrency = config.defaultCurrency;

  return new Response(JSON.stringify({ success: true, data: settings }), {
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

  const parsed = GeneralSettingsSchema.safeParse(body);
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

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) await upsertSettingTyped(db, key, value);
  }

  // Clean up old default_locale key (now derived from locales array isDefault)
  await deleteSetting(db, 'default_locale');

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
