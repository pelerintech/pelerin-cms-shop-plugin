import type { APIRoute } from 'astro';
import { db, shop_settings, sql as dbSql } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { encrypt, decryptIfNeeded } from '../../../../lib/crypto'

const SETTINGS_KEYS = [
  'stripe_publishable_key',
  'stripe_secret_key',
  'stripe_webhook_secret',
];

async function getSetting(key: string): Promise<string | null> {
  const result = await db.run(
    dbSql`SELECT value FROM ${shop_settings}
          WHERE ${shop_settings.key} = ${key} LIMIT 1`,
  );
  if (result.rows.length > 0) {
    return (result.rows[0] as any).value;
  }
  return null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.run(
    dbSql`SELECT id FROM ${shop_settings}
          WHERE ${shop_settings.key} = ${key} LIMIT 1`,
  );
  if (existing.rows.length > 0) {
    await db.run(
      dbSql`UPDATE ${shop_settings}
            SET ${shop_settings.value} = ${value}
            WHERE ${shop_settings.key} = ${key}`,
    );
  } else {
    await db.insert(shop_settings).values({
      id: crypto.randomUUID(),
      key,
      value,
    });
  }
}

function maskValue(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return '****';
  return `****${value.slice(-4)}`;
}

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();
  try {
    await sdk.auth.requireAdmin(context.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings: Record<string, string | null> = {};
  for (const key of SETTINGS_KEYS) {
    const raw = await getSetting(key);
    settings[key] = maskValue(raw ? decryptIfNeeded(raw) : null);
  }

  return new Response(
    JSON.stringify({ success: true, data: settings }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();
  try {
    await sdk.auth.requireAdmin(context.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await context.request.json();

  for (const key of SETTINGS_KEYS) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
      await setSetting(key, encrypt(String(body[key])));
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};