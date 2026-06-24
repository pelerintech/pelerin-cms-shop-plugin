import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { getSetting, upsertSetting } from '../../../../lib/data/settings';
import { encrypt, decryptIfNeeded } from '../../../../lib/crypto';
import type { HandlerDeps } from '../../../../lib/handler-types';

const SETTINGS_KEYS = ['stripe_publishable_key', 'stripe_secret_key', 'stripe_webhook_secret'];

function maskValue(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return '****';
  return `****${value.slice(-4)}`;
}

export const GET: APIRoute = (context) =>
  runGet({ db, sdk: createPluginContext(), ctx: context });

export const PUT: APIRoute = (context) =>
  runPut({ db, sdk: createPluginContext(), ctx: context });

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try { await sdk.auth.requireAdmin(ctx.request); } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const settings: Record<string, string | null> = {};
  for (const key of SETTINGS_KEYS) {
    settings[key] = await getSetting(db, key);
  }

  return new Response(JSON.stringify({
    success: true,
    data: {
      stripe_publishable_key: settings.stripe_publishable_key,
      stripe_secret_key: maskValue(settings.stripe_secret_key),
      stripe_webhook_secret: maskValue(settings.stripe_webhook_secret),
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try { await sdk.auth.requireAdmin(ctx.request); } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const body = await ctx.request.json();

  if (body.stripe_publishable_key !== undefined) {
    await upsertSetting(db, 'stripe_publishable_key', body.stripe_publishable_key);
  }
  if (body.stripe_secret_key !== undefined) {
    const encrypted = await encrypt(body.stripe_secret_key);
    await upsertSetting(db, 'stripe_secret_key', encrypted);
  }
  if (body.stripe_webhook_secret !== undefined) {
    const encrypted = await encrypt(body.stripe_webhook_secret);
    await upsertSetting(db, 'stripe_webhook_secret', encrypted);
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
