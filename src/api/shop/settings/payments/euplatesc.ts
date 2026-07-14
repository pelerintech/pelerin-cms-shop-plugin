import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getSetting, upsertSetting } from '../../../../lib/data/settings';
import { encrypt } from '../../../../lib/crypto';
import { EuplatescSettingsSchema } from '../../../../schemas/settings.schema';
import type { HandlerDeps } from '../../../../lib/handler-types';

const SETTINGS_KEYS = [
  'euplatesc_merchant_id',
  'euplatesc_secret_key',
  'euplatesc_ukey',
  'euplatesc_uapi_key',
];

function maskValue(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return '****';
  return `****${value.slice(-4)}`;
}

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

  const settings: Record<string, string | null> = {};
  for (const key of SETTINGS_KEYS) {
    settings[key] = await getSetting(db, key);
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        euplatesc_merchant_id: settings.euplatesc_merchant_id,
        euplatesc_secret_key: maskValue(settings.euplatesc_secret_key),
        euplatesc_ukey: settings.euplatesc_ukey,
        euplatesc_uapi_key: maskValue(settings.euplatesc_uapi_key),
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
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

  const parsed = EuplatescSettingsSchema.safeParse(body);
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

  if (parsed.data.euplatesc_merchant_id !== undefined) {
    await upsertSetting(db, 'euplatesc_merchant_id', parsed.data.euplatesc_merchant_id);
  }
  if (parsed.data.euplatesc_secret_key !== undefined) {
    const encrypted = await encrypt(parsed.data.euplatesc_secret_key);
    await upsertSetting(db, 'euplatesc_secret_key', encrypted);
  }
  if (parsed.data.euplatesc_ukey !== undefined) {
    await upsertSetting(db, 'euplatesc_ukey', parsed.data.euplatesc_ukey);
  }
  if (parsed.data.euplatesc_uapi_key !== undefined) {
    const encrypted = await encrypt(parsed.data.euplatesc_uapi_key);
    await upsertSetting(db, 'euplatesc_uapi_key', encrypted);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
