/**
 * Data accessors for global product attributes.
 *
 * All functions receive `db: LibSQLDatabase` as the first parameter so they
 * can be tested against the real-SQLite harness and swapped to a different
 * db source (post astro:db migration) without changes.
 *
 * Table objects are imported from `src/db/schema` (pure Drizzle, mirrors
 * `src/db/config.ts`). These are the SAME objects used in prod — Drizzle table
 * objects are structural (name-bound), so a `db` from astro:db queries them
 * identically to a `db` from the test harness.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, eq } from 'drizzle-orm';
import {
  product_attributes,
  product_attribute_options,
  product_attribute_assignments,
  translations,
} from '../../db/schema.ts';
import { getShopConfig } from './settings.ts';

export interface AttributeRow {
  id: string;
  name: string;
  type: string;
  sort_order: number;
  option_count: number | null;
}

/**
 * List all global attributes ordered by sort_order, enriched with the
 * localized name for `locale` (falling back to the default-locale name on the
 * table) and the option_count for select-type attributes.
 *
 * Uses `inArray()` for the IN clauses — NOT the old IN-join idiom (which produced
 * `near "?": syntax error` in this Drizzle/libsql version).
 */
export async function listAttributes(db: LibSQLDatabase, locale: string): Promise<AttributeRow[]> {
  const allAttributes = await db
    .select()
    .from(product_attributes)
    .orderBy(product_attributes.sort_order);

  if (allAttributes.length === 0) {
    return [];
  }

  const attributeIds = allAttributes.map((a) => a.id);

  // Fetch translations for the requested locale (inArray)
  const translationRows = await db
    .select()
    .from(translations)
    .where(inArray(translations.entity_id, attributeIds));
  // Filter by entity_type + locale in memory (avoids compound predicate brittleness)
  const transMap = new Map(
    translationRows
      .filter((t) => t.entity_type === 'product_attribute' && t.locale === locale)
      .map((t) => [t.entity_id, t])
  );

  // Fetch option counts for select-type attributes
  const selectAttributes = allAttributes.filter((a) => a.type === 'select');
  const optionCounts = new Map<string, number>();
  if (selectAttributes.length > 0) {
    const selectAttrIds = selectAttributes.map((a) => a.id);
    const optionRows = await db
      .select()
      .from(product_attribute_options)
      .where(inArray(product_attribute_options.attribute_id, selectAttrIds));
    for (const row of optionRows) {
      const count = optionCounts.get(row.attribute_id) || 0;
      optionCounts.set(row.attribute_id, count + 1);
    }
  }

  return allAttributes.map((a) => {
    const t = transMap.get(a.id);
    return {
      id: a.id,
      name: t?.name ?? a.name,
      type: a.type,
      sort_order: a.sort_order,
      option_count: a.type === 'select' ? optionCounts.get(a.id) || 0 : null,
    };
  });
}

/** Get a single attribute by id with localized name and option count. */
export async function getAttribute(
  db: LibSQLDatabase,
  id: string,
  locale: string
): Promise<AttributeRow | null> {
  const [attr] = await db.select().from(product_attributes).where(eq(product_attributes.id, id));
  if (!attr) return null;

  const config = await getShopConfig(db);
  let name = attr.name;
  if (locale !== config.defaultLocale) {
    const transRows = await db
      .select()
      .from(translations)
      .where(inArray(translations.entity_id, [id]));
    const translated = transRows.find(
      (t) => t.entity_type === 'product_attribute' && t.locale === locale && t.name
    );
    if (translated) name = translated.name;
  }

  let option_count: number | null = null;
  if (attr.type === 'select') {
    const options = await db
      .select()
      .from(product_attribute_options)
      .where(eq(product_attribute_options.attribute_id, id));
    option_count = options.length;
  }

  return { id: attr.id, name, type: attr.type, sort_order: attr.sort_order, option_count };
}

export interface CreateAttributeInput {
  name: string;
  type: string;
  sort_order: number;
}

/** Create a new global attribute. */
export async function createAttribute(
  db: LibSQLDatabase,
  input: CreateAttributeInput
): Promise<{ id: string; name: string; type: string; sort_order: number }> {
  const id = crypto.randomUUID();
  await db
    .insert(product_attributes)
    .values({ id, name: input.name, type: input.type, sort_order: input.sort_order });
  return { id, name: input.name, type: input.type, sort_order: input.sort_order };
}

export interface UpdateAttributeInput {
  name?: string;
  type?: string;
  sort_order?: number;
}

export class AttributeUpdateConflictError extends Error {
  code: 'not_found' | 'type_change_blocked';
  constructor(message: string, code: 'not_found' | 'type_change_blocked' = 'type_change_blocked') {
    super(message);
    this.code = code;
  }
}

/** Update an attribute. Rejects type changes if assignments/options exist. */
export async function updateAttribute(
  db: LibSQLDatabase,
  id: string,
  input: UpdateAttributeInput
): Promise<{ id: string; name: string; type: string; sort_order: number }> {
  const [existing] = await db
    .select()
    .from(product_attributes)
    .where(eq(product_attributes.id, id));
  if (!existing) throw new AttributeUpdateConflictError('Attribute not found', 'not_found');

  if (input.type !== undefined && input.type !== existing.type) {
    const assignments = await db
      .select()
      .from(product_attribute_assignments)
      .where(eq(product_attribute_assignments.attribute_id, id));
    const options = await db
      .select()
      .from(product_attribute_options)
      .where(eq(product_attribute_options.attribute_id, id));
    if (assignments.length > 0 || options.length > 0) {
      throw new AttributeUpdateConflictError(
        'Cannot change type of attribute that has assignments or options',
        'type_change_blocked'
      );
    }
  }

  const updateData: Record<string, any> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.type !== undefined) updateData.type = input.type;
  if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;

  if (Object.keys(updateData).length > 0) {
    await db.update(product_attributes).set(updateData).where(eq(product_attributes.id, id));
  }

  return {
    id,
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    sort_order: input.sort_order ?? existing.sort_order,
  };
}

/** Delete an attribute. Rejects if it has assignments. Deletes its options first. */
export async function deleteAttribute(db: LibSQLDatabase, id: string): Promise<void> {
  const assignments = await db
    .select()
    .from(product_attribute_assignments)
    .where(eq(product_attribute_assignments.attribute_id, id));
  if (assignments.length > 0) {
    throw new AttributeUpdateConflictError(
      'Attribute is assigned to products. Remove assignments first.',
      'type_change_blocked'
    );
  }
  await db.delete(product_attribute_options).where(eq(product_attribute_options.attribute_id, id));
  await db.delete(product_attributes).where(eq(product_attributes.id, id));
}
