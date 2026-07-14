/**
 * Slug resolution and collision detection for categories and products.
 *
 * Resolution model (design D3): translation-first, default-fallback.
 *   1. Look in translations for (entity_type, locale, slug) → if exactly 1 match, resolve.
 *   2. If 0 translation matches, fall back to the parent table's default-locale slug column.
 *   3. Neither → null (not found).
 *
 * Collision detection (design D2): app-level only.
 *   - Resolution-time: >1 translation match for (entity_type, locale, slug) → throw SlugCollisionError.
 *   - Write-time: upsertTranslationWithSlugGuard checks before writing.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq, and, isNotNull } from 'drizzle-orm';
import { categories, products, translations } from '../../db/schema.ts';
import { getCategoryById, getProductWithPrices } from './products.ts';
import { getShopConfig } from './settings.ts';

// ── Error type ──

export class SlugCollisionError extends Error {
  locale: string;
  slug: string;
  entityType: string;
  constructor(message: string, locale: string, slug: string, entityType: string) {
    super(message);
    this.name = 'SlugCollisionError';
    this.locale = locale;
    this.slug = slug;
    this.entityType = entityType;
  }
}

// ── Shared translation-match helper ──

/**
 * Query translations for rows matching (entity_type, locale, slug).
 * Skips rows where slug IS NULL (a null slug is not a resolvable slug).
 * Returns all matches (caller checks for >1 → collision).
 */
async function findTranslationBySlug(
  db: LibSQLDatabase,
  entityType: string,
  slug: string,
  locale: string
): Promise<any[]> {
  return db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.entity_type, entityType),
        eq(translations.locale, locale),
        eq(translations.slug, slug),
        isNotNull(translations.slug)
      )
    );
}

// ── Category resolution ──

/**
 * Resolve a category by its locale-specific slug.
 * Translation-first, default-fallback. Throws SlugCollisionError on >1 match.
 * Returns null if neither translation nor default slug matches.
 */
export async function resolveCategoryBySlug(
  db: LibSQLDatabase,
  slug: string,
  locale: string
): Promise<{ category: any; source: 'translation' | 'default' } | null> {
  // 1. Try translations table first.
  const transRows = await findTranslationBySlug(db, 'category', slug, locale);
  if (transRows.length > 1) {
    throw new SlugCollisionError(
      `Slug collision: ${transRows.length} categories share the slug "${slug}" in locale "${locale}"`,
      locale,
      slug,
      'category'
    );
  }
  if (transRows.length === 1) {
    const cat = await getCategoryById(db, transRows[0].entity_id);
    if (cat) {
      // Overlay localized fields (name, description, slug) onto the result.
      (cat as any).name = transRows[0].name ?? cat.name;
      (cat as any).description = transRows[0].description ?? cat.description;
      (cat as any).slug = transRows[0].slug ?? cat.slug;
      return { category: cat, source: 'translation' };
    }
  }

  // 2. Fall back to the default-locale slug on the parent table.
  const [cat] = await db.select().from(categories).where(eq(categories.slug, slug));
  if (cat) {
    return { category: cat, source: 'default' };
  }

  // 3. Not found.
  return null;
}

// ── Product resolution ──

/**
 * Resolve a product by its locale-specific slug.
 * Translation-first, default-fallback. Throws SlugCollisionError on >1 match.
 * Returns null if neither translation nor default slug matches.
 */
export async function resolveProductBySlug(
  db: LibSQLDatabase,
  slug: string,
  locale: string
): Promise<{ product: any; source: 'translation' | 'default' } | null> {
  // 1. Try translations table first.
  const transRows = await findTranslationBySlug(db, 'product', slug, locale);
  if (transRows.length > 1) {
    throw new SlugCollisionError(
      `Slug collision: ${transRows.length} products share the slug "${slug}" in locale "${locale}"`,
      locale,
      slug,
      'product'
    );
  }
  if (transRows.length === 1) {
    const product = await getProductWithPrices(db, transRows[0].entity_id, locale);
    if (product) {
      // Overlay localized fields onto the result.
      (product as any).name = transRows[0].name ?? product.name;
      (product as any).description = transRows[0].description ?? product.description;
      (product as any).slug = transRows[0].slug ?? product.slug;
      return { product, source: 'translation' };
    }
  }

  // 2. Fall back to the default-locale slug on the parent table.
  const [product] = await db.select().from(products).where(eq(products.slug, slug));
  if (product) {
    const withPrices = await getProductWithPrices(db, product.id, locale);
    if (withPrices) {
      return { product: withPrices, source: 'default' };
    }
  }

  // 3. Not found.
  return null;
}

// ── Write-time collision guard ──

/**
 * Slug-aware upsert: like upsertTranslation but rejects writes that would
 * create a duplicate (entity_type, locale, slug) for a DIFFERENT entity.
 *
 * - If input.slug is null → no collision check, delegates to upsertTranslation.
 * - If input.slug collides with another entity of the same type → throws SlugCollisionError.
 * - Same-entity re-upsert is always allowed.
 */
export async function upsertTranslationWithSlugGuard(
  db: LibSQLDatabase,
  input: {
    entity_type: string;
    entity_id: string;
    locale: string;
    name?: string | null;
    description?: string | null;
    slug?: string | null;
    label?: string | null;
  }
): Promise<void> {
  // Null slug → no collision check.
  if (input.slug == null) {
    return upsertTranslation(db, input);
  }

  // Check for collisions with OTHER entities of the same type.
  const conflicts = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.entity_type, input.entity_type),
        eq(translations.locale, input.locale),
        eq(translations.slug, input.slug),
        isNotNull(translations.slug)
        // Exclude the current entity (same-entity re-upsert is allowed).
        // We can't use eq(translations.entity_id, input.entity_id) in a NOT
        // filter easily with drizzle, so we fetch all matches and filter in JS.
      )
    );

  const otherConflicts = conflicts.filter((c) => c.entity_id !== input.entity_id);
  if (otherConflicts.length > 0) {
    throw new SlugCollisionError(
      `Slug "${input.slug}" is already used by another ${input.entity_type} in locale "${input.locale}"`,
      input.locale,
      input.slug,
      input.entity_type
    );
  }

  return upsertTranslation(db, input);
}

// ── Find slug collisions for admin warning ──

/**
 * Find locales where this entity's slug collides with another entity's slug.
 * Returns an array of locale strings that have collisions.
 */
export async function findSlugCollisions(
  db: LibSQLDatabase,
  entityType: string,
  entityId: string,
  locales: string[]
): Promise<string[]> {
  const collisionLocales: string[] = [];

  for (const locale of locales) {
    // Get this entity's slug for this locale (from translations or parent table).
    let thisSlug: string | null = null;
    const [trans] = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entity_type, entityType),
          eq(translations.entity_id, entityId),
          eq(translations.locale, locale)
        )
      );
    if (trans && trans.slug) {
      thisSlug = trans.slug;
    } else {
      // Fall back to parent table slug (default locale).
      if (entityType === 'category') {
        const [cat] = await db.select().from(categories).where(eq(categories.id, entityId));
        thisSlug = cat?.slug ?? null;
      } else if (entityType === 'product') {
        const [prod] = await db.select().from(products).where(eq(products.id, entityId));
        thisSlug = prod?.slug ?? null;
      }
    }

    if (!thisSlug) continue;

    // Check if any OTHER entity has the same slug in this locale.
    const conflicts = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entity_type, entityType),
          eq(translations.locale, locale),
          eq(translations.slug, thisSlug),
          isNotNull(translations.slug)
        )
      );
    const otherConflicts = conflicts.filter((c) => c.entity_id !== entityId);
    if (otherConflicts.length > 0) {
      collisionLocales.push(locale);
    }
  }

  return collisionLocales;
}

// ── Inline upsertTranslation (kept private to this module, re-exports from products.ts) ──

import { inArray } from 'drizzle-orm';
import { translations as translationsTable } from '../../db/schema.ts';

async function upsertTranslation(
  db: LibSQLDatabase,
  input: {
    entity_type: string;
    entity_id: string;
    locale: string;
    name?: string | null;
    description?: string | null;
    slug?: string | null;
    label?: string | null;
  }
): Promise<void> {
  const rows = await db
    .select()
    .from(translationsTable)
    .where(inArray(translationsTable.entity_id, [input.entity_id]));
  const existing = rows.find(
    (t) => t.entity_type === input.entity_type && t.locale === input.locale
  );
  if (existing) {
    await db
      .update(translationsTable)
      .set({
        name: input.name ?? null,
        description: input.description ?? null,
        slug: input.slug ?? null,
        label: input.label ?? null,
      })
      .where(eq(translationsTable.id, existing.id));
  } else {
    await db.insert(translationsTable).values({
      id: crypto.randomUUID(),
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      locale: input.locale,
      name: input.name ?? null,
      description: input.description ?? null,
      slug: input.slug ?? null,
      label: input.label ?? null,
    });
  }
}
