/**
 * Product CSV import — upsert logic.
 *
 * `importProducts` receives an injected `db` and the parsed CSV rows
 * (Record<string, string>[]). It validates each row via ProductImportRowSchema,
 * resolves the optional category_slug, and upserts the product + ro/en
 * translations keyed by SKU. Invalid rows are reported per-row without aborting
 * the batch (one bad row does not stop the import).
 *
 * SKU is the upsert key (required for import). Duplicate SKUs within the same
 * file are processed sequentially, so the last occurrence's values win (upsert
 * is idempotent).
 *
 * `db` is injected (no astro:db import). All DB access goes through accessors in
 * src/lib/data/.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { ProductImportRowSchema } from '../schemas/import.schema.ts';
import {
  findProductBySku,
  findCategoryBySlug,
  createProduct,
  updateProduct,
  upsertTranslation,
  getTranslation,
} from './data/products.ts';

export interface ImportErrorEntry {
  row: number;
  sku: string | null;
  error: string;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportErrorEntry[];
}

/** Slugify a Romanian product name into a URL-safe slug. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Collapse a ZodError into a single human-readable message. */
function formatZodError(issues: { path: (string | number)[]; message: string }[]): string {
  if (issues.length === 0) return 'Validation failed';
  const first = issues[0];
  const field = first.path.length > 0 ? first.path.join('.') : 'row';
  return `${field}: ${first.message}`;
}

/**
 * Import (upsert) products from parsed CSV rows.
 * @param db   injected LibSQLDatabase handle
 * @param rows parsed CSV rows (Record<string, string>[])
 */
export async function importProducts(
  db: LibSQLDatabase,
  rows: Record<string, string>[]
): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    // +2: 1-based row numbers, with the header on row 1.
    const rowNum = i + 2;
    const skuForError = (typeof raw.sku === 'string' ? raw.sku.trim() : '') || null;

    // 1. Validate the row.
    const parsed = ProductImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push({
        row: rowNum,
        sku: skuForError,
        error: formatZodError(parsed.error.issues as any),
      });
      result.skipped++;
      continue;
    }
    const data = parsed.data;

    // 2. Resolve category (optional).
    let category_id: string | null = null;
    if (data.category_slug) {
      const cat = await findCategoryBySlug(db, data.category_slug);
      if (!cat) {
        result.errors.push({
          row: rowNum,
          sku: data.sku,
          error: `Category not found: '${data.category_slug}'`,
        });
        result.skipped++;
        continue;
      }
      category_id = cat.id;
    }

    // 3. Upsert product by SKU.
    const slug = slugify(data.name_ro);
    const existing = await findProductBySku(db, data.sku);
    if (existing) {
      // UPDATE: only overwrite columns the import row actually provides.
      // Unset optional fields (empty/absent in the CSV) are left untouched on
      // the existing product — we never null out vat_rate, stock, category, or
      // description, and `active` has no CSV column so it is never flipped.
      // Required fields (sku, name_ro, type) are always present on a valid row.
      const updateFields: Record<string, any> = {
        sku: data.sku,
        type: data.type,
        name: data.name_ro,
        slug,
      };
      if (data.vat_rate !== undefined) updateFields.vat_rate = data.vat_rate;
      if (data.stock !== undefined) updateFields.stock = data.stock;
      if (data.category_slug !== undefined) updateFields.category_id = category_id;
      if (data.description_ro !== undefined) updateFields.description = data.description_ro;
      await updateProduct(db, existing.id, updateFields);

      // ro translation: name+slug always (name_ro required); description only
      // when provided, else preserve the existing ro description.
      const existingRo = await getTranslation(db, 'product', existing.id, 'ro');
      await upsertTranslation(db, {
        entity_type: 'product',
        entity_id: existing.id,
        locale: 'ro',
        name: data.name_ro,
        description:
          data.description_ro !== undefined
            ? data.description_ro
            : (existingRo?.description ?? null),
        slug,
        label: null,
      });
      // en translation: only written when name_en is provided (the en block is
      // driven by name_en). description_en preserved from existing when absent.
      if (data.name_en) {
        const existingEn = await getTranslation(db, 'product', existing.id, 'en');
        await upsertTranslation(db, {
          entity_type: 'product',
          entity_id: existing.id,
          locale: 'en',
          name: data.name_en,
          description:
            data.description_en !== undefined
              ? data.description_en
              : (existingEn?.description ?? null),
          slug: slugify(data.name_en),
          label: null,
        });
      }
      result.updated++;
    } else {
      const id = await createProduct(db, {
        sku: data.sku,
        type: data.type,
        has_variants: false, // always false on create; derived at read time
        vat_rate: data.vat_rate ?? null,
        stock: data.stock ?? null,
        category_id,
        active: true,
        name: data.name_ro,
        description: data.description_ro ?? null,
        slug,
      });
      await upsertTranslation(db, {
        entity_type: 'product',
        entity_id: id,
        locale: 'ro',
        name: data.name_ro,
        description: data.description_ro ?? null,
        slug,
        label: null,
      });
      if (data.name_en) {
        await upsertTranslation(db, {
          entity_type: 'product',
          entity_id: id,
          locale: 'en',
          name: data.name_en,
          description: data.description_en ?? null,
          slug: slugify(data.name_en),
          label: null,
        });
      }
      result.created++;
    }
  }

  return result;
}
