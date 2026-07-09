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

/** Locale item shape stored in shop_settings JSON blob. */
export interface LocaleItem {
  code: string;
  name: string;
  isDefault: boolean;
}

/** Currency item shape stored in shop_settings JSON blob. */
export interface CurrencyItem {
  code: string;
  name: string;
  isDefault: boolean;
}

/** Get parsed locales array. Returns empty array if not set. */
export async function getLocales(db: LibSQLDatabase): Promise<LocaleItem[]> {
  const raw = await getSetting(db, 'locales');
  if (!raw) return [];
  try {
    const parsed: LocaleItem[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Get parsed currencies array. Returns empty array if not set. */
export async function getCurrencies(db: LibSQLDatabase): Promise<CurrencyItem[]> {
  const raw = await getSetting(db, 'currencies');
  if (!raw) return [];
  try {
    const parsed: CurrencyItem[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Save locales array (upserts the JSON blob). */
export async function saveLocales(db: LibSQLDatabase, locales: LocaleItem[]): Promise<void> {
  await upsertSetting(db, 'locales', JSON.stringify(locales));
}

/** Save currencies array (upserts the JSON blob). */
export async function saveCurrencies(db: LibSQLDatabase, currencies: CurrencyItem[]): Promise<void> {
  await upsertSetting(db, 'currencies', JSON.stringify(currencies));
}

/**
 * Get settings with JSON-parsed values for locales and currencies.
 *
 * Derives defaultLocale/defaultCurrency from the isDefault flag on each
 * locales/currencies entry. Falls back to the old default_locale/default_currency
 * keys for backward compatibility during migration.
 */
export async function getShopConfig(db: LibSQLDatabase): Promise<{
  locales: LocaleItem[];
  currencies: CurrencyItem[];
  defaultLocale: string;
  defaultCurrency: string;
  raw: Record<string, string>;
}> {
  const settings = await getSettings(db);
  let locales: LocaleItem[] = [];
  let currencies: CurrencyItem[] = [];
  try { locales = JSON.parse(settings.locales || '[]'); } catch {}
  try { currencies = JSON.parse(settings.currencies || '[]'); } catch {}

  // Derive default from isDefault flag; fall back to old key for backward compat.
  // When no config exists at all, return empty string — callers should handle this.
  const defaultLocale = locales.find(l => l.isDefault)?.code
    || settings.default_locale
    || '';
  const defaultCurrency = currencies.find(c => c.isDefault)?.code
    || settings.default_currency
    || '';

  return {
    locales,
    currencies,
    defaultLocale,
    defaultCurrency,
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

/**
 * Typed settings accessors (r17 Task 4).
 *
 * `shop_settings.value` is a TEXT column, so numbers/booleans are serialized to
 * strings at the storage boundary and deserialized on read. Callers use the typed
 * getters/setters and never `parseInt` a `z.string()`.
 */

/**
 * Read a setting and deserialize it to the requested primitive type.
 * For 'boolean' keys: 'true'/'false' → boolean (default false if absent).
 * For 'number' keys: numeric string → number (default 0 if absent/NaN).
 * Strings pass through unchanged.
 */

/** Read a boolean setting ('true'/'false' serialized). Absent → null. */
export async function getSettingBool(db: LibSQLDatabase, key: string): Promise<boolean | null> {
  const raw = await getSetting(db, key);
  if (raw === null) return null;
  return raw === 'true';
}

/** Read a number setting. Absent or non-numeric → null. */
export async function getSettingNumber(db: LibSQLDatabase, key: string): Promise<number | null> {
  const raw = await getSetting(db, key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Upsert a typed setting — serializes numbers/booleans to strings at the
 * storage boundary. Strings pass through.
 */
export async function upsertSettingTyped(
  db: LibSQLDatabase,
  key: string,
  value: number | boolean | string,
): Promise<void> {
  const serialized = typeof value === 'string' ? value : String(value);
  await upsertSetting(db, key, serialized);
}
