/**
 * Zod schemas for bulk CSV import rows.
 *
 * A CSV row arrives as Record<string, string> (all values are strings, possibly
 * empty). These schemas coerce strings into typed values and enforce required
 * fields, so importProducts/importPrices can report row-level validation errors
 * via safeParse without throwing.
 *
 * Conventions:
 *  - Empty optional numeric fields ('') → undefined (not NaN). A `preprocess`
 *    step trims and drops empty strings so they don't reach the number coerce.
 *  - `sku` is required for import (the upsert key) — unlike the UI where SKU is
 *    optional. Whitespace-only sku is treated as missing.
 */
import { z } from 'zod';

/** Trim a string and return undefined when empty, so optional fields stay absent. */
function trimOptional(val: unknown): string | undefined {
  if (typeof val !== 'string') return val as any;
  const t = val.trim();
  return t === '' ? undefined : t;
}

/**
 * Product import row — mirrors the product CSV template:
 *   sku,name_ro,name_en,description_ro,description_en,type,category_slug,vat_rate,stock
 *
 * Required: sku, name_ro, type.
 * type: 'physical' | 'digital'.
 * vat_rate: float 0–1 (optional, empty → undefined).
 * stock: non-negative integer (optional, empty → undefined → unlimited).
 * category_slug: optional (must resolve to an existing category at import time).
 */
export const ProductImportRowSchema = z.object({
  sku: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string().min(1, 'sku is required')
  ),
  name_ro: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string().min(1, 'name_ro is required')
  ),
  name_en: z.preprocess(trimOptional, z.string().min(1).optional()),
  description_ro: z.preprocess(trimOptional, z.string().optional()),
  description_en: z.preprocess(trimOptional, z.string().optional()),
  type: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.enum(['physical', 'digital'], { message: 'type must be "physical" or "digital"' })
  ),
  category_slug: z.preprocess(trimOptional, z.string().min(1).optional()),
  vat_rate: z.preprocess(trimOptional, z.coerce.number().min(0).max(1).optional()),
  stock: z.preprocess(trimOptional, z.coerce.number().int().min(0).optional()),
});

export type ProductImportRow = z.infer<typeof ProductImportRowSchema>;

/**
 * Price import row — mirrors the price CSV template:
 *   sku,currency,price_net
 *
 * Required: sku, currency, price_net (positive number).
 * sku matches an existing product or variant SKU (resolved at import time).
 * currency must match a configured currency code (validated at import time).
 */
export const PriceImportRowSchema = z.object({
  sku: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string().min(1, 'sku is required')
  ),
  currency: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string().min(1, 'currency is required')
  ),
  price_net: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.coerce.number().positive('price_net must be a positive number')
  ),
});

export type PriceImportRow = z.infer<typeof PriceImportRowSchema>;
