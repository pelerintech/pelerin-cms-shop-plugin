/**
 * Data accessors for shop settings (key-value store).
 * Uses eq — never the sql IN-join idiom.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { shop_settings } from '../../db/schema.ts';

/** Get a single setting value by key, or null if not found. */
export async function getSetting(db: LibSQLDatabase, key: string): Promise<string | null> {
  const [row] = await db.select().from(shop_settings).where(eq(shop_settings.key, key));
  return row?.value ?? null;
}

/** Get all settings as a keyed object. */
export async function getSettings(db: LibSQLDatabase): Promise<Record<string, string>> {
  const rows = await db.select().from(shop_settings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

/** Get settings with JSON-parsed values for locales and currencies. */
export async function getShopConfig(db: LibSQLDatabase): Promise<{
  locales: any[];
  currencies: any[];
  defaultLocale: string;
  defaultCurrency: string;
  raw: Record<string, string>;
}> {
  const settings = await getSettings(db);
  let locales: any[] = [];
  let currencies: any[] = [];
  try { locales = JSON.parse(settings.locales || '[]'); } catch {}
  try { currencies = JSON.parse(settings.currencies || '[]'); } catch {}
  return {
    locales,
    currencies,
    defaultLocale: locales.find(l => l.isDefault)?.code || 'ro',
    defaultCurrency: currencies.find(c => c.isDefault)?.code || 'RON',
    raw: settings,
  };
}

/** Upsert a setting by key. */
export async function upsertSetting(db: LibSQLDatabase, key: string, value: string): Promise<void> {
  const [existing] = await db.select().from(shop_settings).where(eq(shop_settings.key, key));
  if (existing) {
    await db.update(shop_settings).set({ value }).where(eq(shop_settings.id, existing.id));
  } else {
    await db.insert(shop_settings).values({ id: crypto.randomUUID(), key, value });
  }
}

/** Delete a setting by key. */
export async function deleteSetting(db: LibSQLDatabase, key: string): Promise<void> {
  await db.delete(shop_settings).where(eq(shop_settings.key, key));
}
