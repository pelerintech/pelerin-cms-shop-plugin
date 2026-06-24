/**
 * Data accessors for the product catalog: products, categories, prices, translations, images.
 * Uses inArray/eq — never the sql IN-join idiom.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, eq, and, isNull, asc, desc, count } from 'drizzle-orm';
import {
  products, categories, product_prices, product_images, translations, product_variants,
} from '../../db/schema.ts';

// ── Products ──

export interface ProductListRow {
  id: string;
  sku: string | null;
  name: string;
  slug: string;
  type: string;
  active: boolean;
  has_variants: boolean;
  vat_rate: number | null;
  stock: number | null;
  category_id: string | null;
  created_at: Date;
  updated_at: Date | null;
  description: string | null;
}

export interface ListProductsOptions {
  page?: number;
  limit?: number;
  locale?: string;
  category_id?: string;
  active?: boolean;
  search?: string;
}

export interface ListProductsResult {
  products: ProductListRow[];
  total: number;
  page: number;
  limit: number;
}

export async function listProducts(
  db: LibSQLDatabase,
  opts: ListProductsOptions = {},
): Promise<ListProductsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const locale = opts.locale ?? 'ro';

  let rows = await db.select().from(products);

  if (opts.category_id) rows = rows.filter(p => p.category_id === opts.category_id);
  if (opts.active !== undefined) rows = rows.filter(p => p.active === opts.active);
  if (opts.search) {
    const s = opts.search.toLowerCase();
    rows = rows.filter(p =>
      (p.name && p.name.toLowerCase().includes(s)) ||
      (p.sku && p.sku.toLowerCase().includes(s)) ||
      (p.slug && p.slug.toLowerCase().includes(s)),
    );
  }

  // Sort DESC by created_at
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const total = rows.length;
  const paged = rows.slice((page - 1) * limit, page * limit);

  // Enrich with translations
  const productIds = paged.map(p => p.id);

  // Derive has_variants from actual variant rows (batched), ignoring the DB
  // column (a vestige — set false on create, overridden at read).
  await applyDerivedHasVariants(db, paged);

  if (productIds.length > 0 && locale !== 'ro') {
    const transRows = await db.select().from(translations).where(inArray(translations.entity_id, productIds));
    const transMap = new Map(
      transRows.filter(t => t.entity_type === 'product' && t.locale === locale).map(t => [t.entity_id, t]),
    );
    for (const p of paged) {
      const t = transMap.get(p.id);
      if (t) {
        (p as any).name = t.name ?? p.name;
        (p as any).description = t.description ?? p.description;
        (p as any).slug = t.slug ?? p.slug;
      }
    }
  }

  return { products: paged as ProductListRow[], total, page, limit };
}

export interface ProductWithPrices extends ProductListRow {
  prices: { currency: string; price_net: number; price_gross: number }[];
}

export async function getProductWithPrices(
  db: LibSQLDatabase,
  productId: string,
  locale: string,
): Promise<ProductWithPrices | null> {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) return null;

  let name = product.name;
  let description = product.description;
  let slug = product.slug;
  if (locale !== 'ro') {
    const transRows = await db.select().from(translations).where(inArray(translations.entity_id, [productId]));
    const t = transRows.find(t => t.entity_type === 'product' && t.locale === locale);
    if (t) {
      name = t.name ?? name;
      description = t.description ?? description;
      slug = t.slug ?? slug;
    }
  }

  const prices = await db.select().from(product_prices).where(eq(product_prices.product_id, productId));
  const enrichedPrices = prices
    .filter(p => p.variant_id === null)
    .map(p => ({
      currency: p.currency,
      price_net: p.price_net,
      price_gross: Math.round(p.price_net * (1 + (product.vat_rate ?? 0)) * 100) / 100,
    }));

  // Derive has_variants from actual variant rows (ignore the DB column).
  await applyDerivedHasVariants(db, [product]);

  return { ...product, name, description, slug, prices: enrichedPrices } as ProductWithPrices;
}

export async function getProductById(
  db: LibSQLDatabase,
  productId: string,
): Promise<ProductListRow | null> {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) return null;
  // Derive has_variants from actual variant rows (ignore the DB column).
  await applyDerivedHasVariants(db, [product]);
  return (product as ProductListRow) ?? null;
}

/** Find a product by its SKU (case-sensitive). Returns null if not found. */
export async function findProductBySku(
  db: LibSQLDatabase,
  sku: string,
): Promise<ProductListRow | null> {
  const [product] = await db.select().from(products).where(eq(products.sku, sku));
  if (!product) return null;
  await applyDerivedHasVariants(db, [product]);
  return (product as ProductListRow) ?? null;
}

/**
 * Batch-count variants for the given product ids. Returns a map productId→count.
 * Used to derive `has_variants` (one query for all products in a list).
 */
async function countProductVariants(
  db: LibSQLDatabase,
  productIds: string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(product_variants)
    .where(inArray(product_variants.product_id, productIds));
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.product_id, (counts.get(r.product_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Derive `has_variants` on a list of product rows from actual variant rows
 * (batched query), overriding the DB column.
 */
async function applyDerivedHasVariants(db: LibSQLDatabase, rows: any[]): Promise<void> {
  const ids = rows.map(r => r.id);
  if (ids.length === 0) return;
  const counts = await countProductVariants(db, ids);
  for (const r of rows) {
    r.has_variants = (counts.get(r.id) ?? 0) > 0;
  }
}

export interface CreateProductInput {
  sku?: string | null;
  type: string;
  has_variants: boolean;
  vat_rate?: number | null;
  stock?: number | null;
  category_id?: string | null;
  active: boolean;
  name: string;
  description?: string | null;
  slug: string;
}

export async function createProduct(db: LibSQLDatabase, input: CreateProductInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  // has_variants is always false on create — it's derived at read time
  // (true iff ≥1 variant row exists). The input value is ignored.
  await db.insert(products).values({
    id, sku: input.sku ?? null, type: input.type, has_variants: false,
    vat_rate: input.vat_rate ?? null, stock: input.stock ?? null, category_id: input.category_id ?? null,
    active: input.active, name: input.name, description: input.description ?? null, slug: input.slug,
    created_at: now, updated_at: now,
  });
  return id;
}

export interface UpdateProductInput {
  sku?: string | null;
  type?: string;
  has_variants?: boolean;
  vat_rate?: number | null;
  stock?: number | null;
  category_id?: string | null;
  active?: boolean;
  name?: string;
  description?: string | null;
  slug?: string;
}

export async function updateProduct(db: LibSQLDatabase, id: string, input: UpdateProductInput): Promise<void> {
  const updateData: Record<string, any> = { updated_at: new Date() };
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) updateData[k] = v;
  }
  // has_variants is derived at read time — never written from input (vestige column).
  delete updateData.has_variants;
  await db.update(products).set(updateData).where(eq(products.id, id));
}

export async function deleteProduct(db: LibSQLDatabase, id: string): Promise<void> {
  await db.delete(products).where(eq(products.id, id));
}

// ── Categories ──

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  slug: string;
  sort_order: number;
  created_at: Date | null;
  updated_at: Date | null;
}

export async function listCategories(db: LibSQLDatabase, locale: string): Promise<CategoryRow[]> {
  let rows = await db.select().from(categories);
  rows.sort((a, b) => (a.sort_order < b.sort_order ? -1 : 1));

  if (locale !== 'ro') {
    const ids = rows.map(r => r.id);
    if (ids.length > 0) {
      const transRows = await db.select().from(translations).where(inArray(translations.entity_id, ids));
      const transMap = new Map(
        transRows.filter(t => t.entity_type === 'category' && t.locale === locale).map(t => [t.entity_id, t]),
      );
      for (const r of rows) {
        const t = transMap.get(r.id);
        if (t) {
          (r as any).name = t.name ?? r.name;
          (r as any).description = t.description ?? r.description;
        }
      }
    }
  }
  return rows as CategoryRow[];
}

export async function getCategoryById(db: LibSQLDatabase, id: string): Promise<CategoryRow | null> {
  const [cat] = await db.select().from(categories).where(eq(categories.id, id));
  return (cat as CategoryRow) ?? null;
}

/** Find a category by its default-locale slug. Returns null if not found. */
export async function findCategoryBySlug(
  db: LibSQLDatabase,
  slug: string,
): Promise<CategoryRow | null> {
  const [cat] = await db.select().from(categories).where(eq(categories.slug, slug));
  return (cat as CategoryRow) ?? null;
}

export async function createCategory(db: LibSQLDatabase, input: { parent_id?: string | null; name: string; description?: string | null; slug: string; sort_order: number }): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(categories).values({
    id, parent_id: input.parent_id ?? null, name: input.name, description: input.description ?? null,
    slug: input.slug, sort_order: input.sort_order, created_at: now, updated_at: now,
  });
  return id;
}

export async function updateCategory(db: LibSQLDatabase, id: string, input: Record<string, any>): Promise<void> {
  await db.update(categories).set({ ...input, updated_at: new Date() }).where(eq(categories.id, id));
}

export async function deleteCategory(db: LibSQLDatabase, id: string): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id));
}

// ── Prices ──

export async function listPricesForProduct(db: LibSQLDatabase, productId: string): Promise<any[]> {
  return await db.select().from(product_prices).where(eq(product_prices.product_id, productId));
}

export async function listPricesForVariant(db: LibSQLDatabase, variantId: string): Promise<any[]> {
  return await db.select().from(product_prices).where(eq(product_prices.variant_id, variantId));
}

export async function upsertPrice(db: LibSQLDatabase, input: { product_id?: string | null; variant_id?: string | null; currency: string; price_net: number }): Promise<void> {
  // Check if price exists
  let existing: any[] = [];
  if (input.variant_id) {
    existing = await db.select().from(product_prices).where(eq(product_prices.variant_id, input.variant_id));
  } else if (input.product_id) {
    existing = await db.select().from(product_prices).where(eq(product_prices.product_id, input.product_id));
  }
  const match = existing.find(p => p.currency === input.currency && p.variant_id === (input.variant_id ?? null));
  if (match) {
    await db.update(product_prices).set({ price_net: input.price_net }).where(eq(product_prices.id, match.id));
  } else {
    await db.insert(product_prices).values({
      id: crypto.randomUUID(), product_id: input.product_id ?? null, variant_id: input.variant_id ?? null,
      currency: input.currency, price_net: input.price_net,
    });
  }
}

export async function deletePrice(db: LibSQLDatabase, id: string): Promise<void> {
  await db.delete(product_prices).where(eq(product_prices.id, id));
}

// ── Translations ──

export async function listTranslations(db: LibSQLDatabase, entityType: string, entityId: string): Promise<any[]> {
  const rows = await db.select().from(translations).where(inArray(translations.entity_id, [entityId]));
  return rows.filter(t => t.entity_type === entityType);
}

export async function getTranslation(db: LibSQLDatabase, entityType: string, entityId: string, locale: string): Promise<any | null> {
  const rows = await db.select().from(translations).where(inArray(translations.entity_id, [entityId]));
  return rows.find(t => t.entity_type === entityType && t.locale === locale) ?? null;
}

export async function deleteTranslation(db: LibSQLDatabase, entityType: string, entityId: string, locale: string): Promise<void> {
  const rows = await db.select().from(translations).where(inArray(translations.entity_id, [entityId]));
  const t = rows.find(r => r.entity_type === entityType && r.locale === locale);
  if (t) await db.delete(translations).where(eq(translations.id, t.id));
}

export async function upsertTranslation(db: LibSQLDatabase, input: {
  entity_type: string; entity_id: string; locale: string;
  name?: string | null; description?: string | null; slug?: string | null; label?: string | null;
}): Promise<void> {
  // Find existing translation for this entity + locale
  const rows = await db.select().from(translations).where(inArray(translations.entity_id, [input.entity_id]));
  const existing = rows.find(t => t.entity_type === input.entity_type && t.locale === input.locale);
  if (existing) {
    await db.update(translations).set({
      name: input.name ?? null, description: input.description ?? null,
      slug: input.slug ?? null, label: input.label ?? null,
    }).where(eq(translations.id, existing.id));
  } else {
    await db.insert(translations).values({
      id: crypto.randomUUID(), entity_type: input.entity_type, entity_id: input.entity_id, locale: input.locale,
      name: input.name ?? null, description: input.description ?? null, slug: input.slug ?? null, label: input.label ?? null,
    });
  }
}

// ── Product Images ──

export async function listProductImage(db: LibSQLDatabase, productId: string): Promise<any[]> {
  const rows = await db.select().from(product_images).where(eq(product_images.product_id, productId));
  rows.sort((a, b) => (a.sort_order < b.sort_order ? -1 : 1));
  return rows;
}

export async function createProductImage(db: LibSQLDatabase, input: { product_id: string; variant_id?: string | null; url: string; alt?: string | null; sort_order: number }): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(product_images).values({
    id, product_id: input.product_id, variant_id: input.variant_id ?? null, url: input.url,
    alt: input.alt ?? null, sort_order: input.sort_order,
  });
  return id;
}

export async function deleteProductImage(db: LibSQLDatabase, id: string): Promise<void> {
  await db.delete(product_images).where(eq(product_images.id, id));
}

/** Reorder images by setting sort_order from an ordered list of image IDs. */
export async function reorderProductImages(db: LibSQLDatabase, imageIds: string[]): Promise<void> {
  for (let i = 0; i < imageIds.length; i++) {
    const rows = await db.select().from(product_images).where(eq(product_images.id, imageIds[i]));
    if (rows.length > 0) {
      await db.update(product_images).set({ sort_order: i }).where(eq(product_images.id, imageIds[i]));
    }
  }
}
