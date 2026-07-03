/**
 * Data accessors for the product catalog: products, categories, prices, translations, images.
 * Uses inArray/eq — never the sql IN-join idiom.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, eq, and, isNull, asc, desc, count, or, like } from 'drizzle-orm';
import {
  products, categories, product_prices, product_images, translations, product_variants,
  product_attribute_assignments, product_attribute_values, cart_items,
} from '../../db/schema.ts';
import { getShopConfig } from './settings.ts';

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
  const config = await getShopConfig(db);
  const locale = opts.locale ?? config.defaultLocale;

  // Build WHERE in SQL (r17 Task 9) — no full-table load.
  const conditions: any[] = [];
  if (opts.category_id) conditions.push(eq(products.category_id, opts.category_id));
  if (opts.active !== undefined) conditions.push(eq(products.active, opts.active));
  if (opts.search) {
    const s = `%${opts.search.toLowerCase()}%`;
    conditions.push(or(like(products.name, s), like(products.sku, s), like(products.slug, s)));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db.select({ value: count() }).from(products).where(where);
  const total = countRow?.value ?? 0;

  const paged = await db.select().from(products)
    .where(where)
    .orderBy(desc(products.created_at))
    .limit(limit)
    .offset((page - 1) * limit) as ProductListRow[];

  // Enrich the page only (translations + derived has_variants).
  const productIds = paged.map(p => p.id);

  // Derive has_variants from actual variant rows (batched), ignoring the DB
  // column (a vestige — set false on create, overridden at read).
  await applyDerivedHasVariants(db, paged);

  if (productIds.length > 0 && locale !== config.defaultLocale) {
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
  variants: { id: string; sku: string | null; stock: number | null; active: boolean; prices: { currency: string; price_net: number }[] }[];
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
  const productConfig = await getShopConfig(db);
  if (locale !== productConfig.defaultLocale) {
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

  // Fetch variants and their prices
  const variantRows = await db.select().from(product_variants).where(eq(product_variants.product_id, productId));
  const variantIds = variantRows.map(v => v.id);
  const variantPrices = variantIds.length > 0
    ? await db.select().from(product_prices).where(inArray(product_prices.variant_id, variantIds))
    : [];
  const variantById = new Map<string, typeof variantPrices>();
  for (const vp of variantPrices) {
    if (!variantById.has(vp.variant_id)) {
      variantById.set(vp.variant_id, []);
    }
    variantById.get(vp.variant_id)!.push(vp);
  }
  const variants = variantRows.map(v => ({
    id: v.id,
    sku: v.sku,
    stock: v.stock,
    active: v.active,
    prices: (variantById.get(v.id) ?? []).map(vp => ({
      currency: vp.currency,
      price_net: vp.price_net,
    })),
  }));

  // Derive has_variants from actual variant rows (ignore the DB column).
  await applyDerivedHasVariants(db, [product]);

  return { ...product, name, description, slug, prices: enrichedPrices, variants } as ProductWithPrices;
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

/**
 * Update a product and upsert translations for any per-locale fields found in
 * the raw request body.
 *
 * Only processes fields matching `name_{code}`, `slug_{code}`, `description_{code}`
 * where `code` is in `knownLocaleCodes` — avoids colliding with custom fields
 * like `name_special` that share the prefix but are not locale codes.
 * Translations for the default locale are never upserted (those live on the
 * products table directly).
 */
export async function updateProductWithTranslations(
  db: LibSQLDatabase,
  id: string,
  productInput: UpdateProductInput,
  rawBody: Record<string, any>,
  knownLocaleCodes: Set<string>,
): Promise<void> {
  await updateProduct(db, id, productInput);

  const translationFields = ['name', 'slug', 'description'];
  const localeData: Record<string, { name?: string | null; slug?: string | null; description?: string | null }> = {};

  for (const [key, value] of Object.entries(rawBody)) {
    for (const field of translationFields) {
      const suffix = key.slice(field.length + 1); // e.g. "name_en" -> "en"
      if (key === `${field}_${suffix}` && knownLocaleCodes.has(suffix)) {
        if (!localeData[suffix]) localeData[suffix] = {};
        localeData[suffix][field] = value || null;
      }
    }
  }

  for (const [locale, data] of Object.entries(localeData)) {
    await upsertTranslation(db, {
      entity_type: 'product',
      entity_id: id,
      locale,
      name: data.name ?? null,
      description: data.description ?? null,
      slug: data.slug ?? null,
      label: null,
    });
  }
}

export async function deleteProduct(db: LibSQLDatabase, id: string): Promise<void> {
  // Transactional cascade (r17 Task 7). Deletes all child rows in FK-safe order,
  // mirroring deleteVariant at product scope. order_items are snapshots and are
  // NOT deleted (order history preserved; order_items.product_id may dangle).
  await db.transaction(async (tx) => {
    // Collect the product's variant ids once (used for variant-scoped deletes).
    const variantRows = await tx.select({ id: product_variants.id })
      .from(product_variants)
      .where(eq(product_variants.product_id, id));
    const variantIds = variantRows.map((r) => r.id);

    // 1. attribute values — variant-level (by variant_id set) then product-level.
    if (variantIds.length) {
      await tx.delete(product_attribute_values).where(
        and(eq(product_attribute_values.entity_type, 'variant'), inArray(product_attribute_values.entity_id, variantIds)),
      );
    }
    await tx.delete(product_attribute_values).where(
      and(eq(product_attribute_values.entity_type, 'product'), eq(product_attribute_values.entity_id, id)),
    );

    // 2. attribute assignments for the product.
    await tx.delete(product_attribute_assignments).where(eq(product_attribute_assignments.product_id, id));

    // 3. prices — product-level + variant-level.
    await tx.delete(product_prices).where(eq(product_prices.product_id, id));
    if (variantIds.length) {
      await tx.delete(product_prices).where(inArray(product_prices.variant_id, variantIds));
    }

    // 4. images for the product.
    await tx.delete(product_images).where(eq(product_images.product_id, id));

    // 5. variants.
    await tx.delete(product_variants).where(eq(product_variants.product_id, id));

    // 6. cart_items referencing the product or its variants (transient cart; a
    //    delisted product drops from carts). order_items are snapshots — untouched.
    if (variantIds.length) {
      await tx.delete(cart_items).where(
        or(eq(cart_items.product_id, id), inArray(cart_items.variant_id, variantIds)),
      );
    } else {
      await tx.delete(cart_items).where(eq(cart_items.product_id, id));
    }

    // 7. the product row itself.
    await tx.delete(products).where(eq(products.id, id));
  });
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
  const config = await getShopConfig(db);
  let rows = await db.select().from(categories);
  rows.sort((a, b) => (a.sort_order < b.sort_order ? -1 : 1));

  if (locale !== config.defaultLocale) {
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

/**
 * Update a category and upsert translations for any per-locale fields found in
 * the raw request body.
 *
 * Only processes fields matching `name_{code}`, `slug_{code}`, `description_{code}`
 * where `code` is in `knownLocaleCodes` — avoids colliding with custom fields
 * like `name_special` that share the prefix but are not locale codes.
 * Translations for the default locale are never upserted (those live on the
 * categories table directly).
 */
export async function updateCategoryWithTranslations(
  db: LibSQLDatabase,
  id: string,
  categoryInput: Record<string, any>,
  rawBody: Record<string, any>,
  knownLocaleCodes: Set<string>,
): Promise<void> {
  await updateCategory(db, id, categoryInput);

  const translationFields = ['name', 'slug', 'description'];
  const localeData: Record<string, { name?: string | null; slug?: string | null; description?: string | null }> = {};

  for (const [key, value] of Object.entries(rawBody)) {
    for (const field of translationFields) {
      const suffix = key.slice(field.length + 1); // e.g. "name_ro" -> "ro"
      if (key === `${field}_${suffix}` && knownLocaleCodes.has(suffix)) {
        if (!localeData[suffix]) localeData[suffix] = {};
        localeData[suffix][field] = value || null;
      }
    }
  }

  for (const [locale, data] of Object.entries(localeData)) {
    await upsertTranslation(db, {
      entity_type: 'category',
      entity_id: id,
      locale,
      name: data.name ?? null,
      description: data.description ?? null,
      slug: data.slug ?? null,
      label: null,
    });
  }
}

export class CategoryError extends Error {
  status: number;
  code: 'not_found' | 'has_children' | 'has_products';
  constructor(message: string, code: 'not_found' | 'has_children' | 'has_products' = 'has_children', status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function deleteCategory(db: LibSQLDatabase, id: string): Promise<void> {
  // Guard (r17 Task 8): refuse deletion if child categories or products reference
  // this category, mirroring deleteAttribute's refuse-if-referenced pattern. Re-
  // parenting silently changes product categorization (a data-loss surprise), so
  // refuse-and-let-admin-deal-with-it is the safer choice.
  const children = await db.select().from(categories).where(eq(categories.parent_id, id));
  if (children.length > 0) {
    throw new CategoryError('Category has child categories; re-parent or delete them first', 'has_children', 409);
  }
  const prods = await db.select().from(products).where(eq(products.category_id, id));
  if (prods.length > 0) {
    throw new CategoryError('Category has products; reassign them first', 'has_products', 409);
  }
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

/** Fetch translations for multiple entity IDs of a given type.
 * Returns all matching rows (no locale filter). Returns empty array for empty input. */
export async function listTranslationsByEntityIds(
  db: LibSQLDatabase,
  entityType: string,
  entityIds: string[],
): Promise<any[]> {
  if (entityIds.length === 0) return [];
  const rows = await db.select().from(translations).where(inArray(translations.entity_id, entityIds));
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

export async function listProductImage(db: LibSQLDatabase, sdk: { storage: { getUrl: (key: string) => string } }, productId: string): Promise<any[]> {
  const rows = await db.select().from(product_images).where(eq(product_images.product_id, productId));
  rows.sort((a, b) => (a.sort_order < b.sort_order ? -1 : 1));
  // Resolve storage key → servable URL at the accessor layer (design D2).
  // The `url` column holds an opaque storage KEY; no raw key ever reaches a consumer.
  for (const row of rows) {
    row.url = sdk.storage.getUrl(row.url);
  }
  return rows;
}

export async function createProductImage(db: LibSQLDatabase, input: { product_id: string; variant_id?: string | null; storage_key: string; mime: string; size: number; width?: number | null; height?: number | null; original_filename?: string | null; alt?: string | null; sort_order: number }): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(product_images).values({
    id, product_id: input.product_id, variant_id: input.variant_id ?? null,
    url: input.storage_key, // url column holds the storage KEY (design D2)
    alt: input.alt ?? null, sort_order: input.sort_order,
    mime: input.mime, size: input.size,
    width: input.width ?? null, height: input.height ?? null,
    original_filename: input.original_filename ?? null,
  });
  return id;
}

export async function deleteProductImage(db: LibSQLDatabase, sdk: { storage: { delete: (key: string) => Promise<void> } }, id: string): Promise<void> {
  // Bytes-first-then-row ordering (design D7): if the byte delete fails, the row
  // survives so the user can retry; orphan bytes (no key reference) are unrecoverable.
  const rows = await db.select({ url: product_images.url }).from(product_images).where(eq(product_images.id, id));
  if (rows.length === 0) return; // no row → no-op (idempotent; accessor tolerates missing row)
  await sdk.storage.delete(rows[0].url); // url column holds the storage KEY
  await db.delete(product_images).where(eq(product_images.id, id));
}

/** Reorder images by setting sort_order from an ordered list of image IDs. */
export async function reorderProductImages(db: LibSQLDatabase, imageIds: string[]): Promise<void> {
  // Transactional (r17 Task 10) — a mid-reorder failure rolls back all sort_order
  // changes. Updates each image's sort_order to its index in the list.
  if (imageIds.length === 0) return;
  await db.transaction(async (tx) => {
    for (let i = 0; i < imageIds.length; i++) {
      await tx.update(product_images).set({ sort_order: i }).where(eq(product_images.id, imageIds[i]));
    }
  });
}
