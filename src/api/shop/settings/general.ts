import type { APIRoute } from 'astro';
import { db, shop_settings, sql as dbSql } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { z } from 'zod';

const SETTINGS_KEYS = [
  'shop_name',
  'order_number_prefix',
  'order_number_year',
  'order_number_padding',
  'default_currency',
  'default_locale',
];

const GeneralSettingsSchema = z.object({
  shop_name: z.string().optional(),
  order_number_prefix: z.string().optional(),
  order_number_year: z.string().optional(),
  order_number_padding: z.string().optional(),
  default_currency: z.string().optional(),
  default_locale: z.string().optional(),
});

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

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();
  try {
    await sdk.auth.requireAdmin(context.request);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const settings: Record<string, string | null> = {};
  for (const key of SETTINGS_KEYS) {
    settings[key] = await getSetting(key);
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
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const parsed = GeneralSettingsSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      fields[path] = issue.message;
    }
    return new Response(
      JSON.stringify({ success: false, error: 'Validation failed', fields }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      await setSetting(key, String(value));
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};