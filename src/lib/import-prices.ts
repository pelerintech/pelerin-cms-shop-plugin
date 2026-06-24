/**
 * Price CSV import — upsert logic.
 *
 * `importPrices` receives an injected `db` and the parsed CSV rows
 * (Record<string, string>[]). It validates each row via PriceImportRowSchema,
 * checks the currency against the shop's configured currencies, finds the
 * product or variant by SKU, and upserts the per-currency price. Invalid rows
 * (bad currency, unknown SKU, non-positive price) are reported per-row without
 * aborting the batch.
 *
 * `db` is injected (no astro:db import). All DB access goes through accessors in
 * src/lib/data/.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { PriceImportRowSchema } from '../schemas/import.schema.ts';
import { findProductBySku, upsertPrice } from './data/products.ts';
import { findVariantBySku } from './data/variants.ts';
import { getShopConfig } from './data/settings.ts';

export interface ImportErrorEntry {
  row: number;
  sku: string | null;
  error: string;
}

export interface ImportResult {
  total: number;
  /** Price import has no create distinction — every successful row is an upsert (updated). */
  created: number;
  updated: number;
  skipped: number;
  errors: ImportErrorEntry[];
}

/** Collapse a ZodError into a single human-readable message. */
function formatZodError(issues: { path: (string | number)[]; message: string }[]): string {
  if (issues.length === 0) return 'Validation failed';
  const first = issues[0];
  const field = first.path.length > 0 ? first.path.join('.') : 'row';
  return `${field}: ${first.message}`;
}

/**
 * Import (upsert) prices from parsed CSV rows.
 * @param db   injected LibSQLDatabase handle
 * @param rows parsed CSV rows (Record<string, string>[])
 */
export async function importPrices(
  db: LibSQLDatabase,
  rows: Record<string, string>[],
): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [] };

  // Pre-load configured currency codes once.
  const { currencies } = await getShopConfig(db);
  const currencyCodes = new Set(currencies.map(c => c.code));

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNum = i + 2; // +2: header on row 1, 1-based data rows.
    const skuForError = (typeof raw.sku === 'string' ? raw.sku.trim() : '') || null;

    // 1. Validate the row.
    const parsed = PriceImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push({ row: rowNum, sku: skuForError, error: formatZodError(parsed.error.issues as any) });
      result.skipped++;
      continue;
    }
    const data = parsed.data;

    // 2. Validate currency against configured currencies.
    if (!currencyCodes.has(data.currency)) {
      result.errors.push({ row: rowNum, sku: data.sku, error: `Unknown currency: '${data.currency}'` });
      result.skipped++;
      continue;
    }

    // 3. Find product or variant by SKU.
    const product = await findProductBySku(db, data.sku);
    const variant = product ? null : await findVariantBySku(db, data.sku);
    if (!product && !variant) {
      result.errors.push({ row: rowNum, sku: data.sku, error: `No product or variant with SKU: '${data.sku}'` });
      result.skipped++;
      continue;
    }

    // 4. Upsert the price.
    await upsertPrice(db, {
      product_id: product?.id ?? null,
      variant_id: variant?.id ?? null,
      currency: data.currency,
      price_net: data.price_net,
    });
    result.updated++;
  }

  return result;
}
