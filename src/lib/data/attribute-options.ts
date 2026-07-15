/**
 * Data accessors for attribute options (select-type attribute values).
 * Uses inArray/eq — never the sql IN-join idiom.
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

export interface OptionRow {
  id: string;
  attribute_id: string;
  value: string;
  label: string;
  sort_order: number;
}

export class OptionError extends Error {
  code: 'not_found' | 'not_select' | 'in_use';
  constructor(message: string, code: 'not_found' | 'not_select' | 'in_use' = 'not_found') {
    super(message);
    this.code = code;
  }
}

/** List all options for an attribute, with localized labels. */
export async function listOptions(
  db: LibSQLDatabase,
  attributeId: string,
  locale: string
): Promise<OptionRow[]> {
  const [attr] = await db
    .select()
    .from(product_attributes)
    .where(eq(product_attributes.id, attributeId));
  if (!attr) throw new OptionError('Attribute not found', 'not_found');

  const options = await db
    .select()
    .from(product_attribute_options)
    .where(eq(product_attribute_options.attribute_id, attributeId))
    .orderBy(product_attribute_options.sort_order);

  if (options.length === 0) return [];

  const optionIds = options.map((o) => o.id);
  const transRows = await db
    .select()
    .from(translations)
    .where(inArray(translations.entity_id, optionIds));
  const transMap = new Map(
    transRows
      .filter((t) => t.entity_type === 'product_attribute_option' && t.locale === locale)
      .map((t) => [t.entity_id, t])
  );

  return options.map((o) => ({
    id: o.id,
    attribute_id: o.attribute_id,
    value: o.value,
    label: transMap.get(o.id)?.label ?? o.value,
    sort_order: o.sort_order,
  }));
}

/** Get a single option by id with localized label. */
export async function getOption(
  db: LibSQLDatabase,
  optionId: string,
  locale: string
): Promise<OptionRow | null> {
  const [opt] = await db
    .select()
    .from(product_attribute_options)
    .where(eq(product_attribute_options.id, optionId));
  if (!opt) return null;

  const config = await getShopConfig(db);
  let label = opt.value;
  if (locale !== config.defaultLocale) {
    const transRows = await db
      .select()
      .from(translations)
      .where(inArray(translations.entity_id, [optionId]));
    const translated = transRows.find(
      (t) => t.entity_type === 'product_attribute_option' && t.locale === locale && t.label
    );
    if (translated) label = translated.label;
  }
  return {
    id: opt.id,
    attribute_id: opt.attribute_id,
    value: opt.value,
    label,
    sort_order: opt.sort_order,
  };
}

export interface CreateOptionInput {
  value: string;
  sort_order: number;
}

/** Create a new option on a select-type attribute. */
export async function createOption(
  db: LibSQLDatabase,
  attributeId: string,
  input: CreateOptionInput
): Promise<{ id: string; attribute_id: string; value: string; sort_order: number }> {
  const [attr] = await db
    .select()
    .from(product_attributes)
    .where(eq(product_attributes.id, attributeId));
  if (!attr) throw new OptionError('Attribute not found', 'not_found');
  if (attr.type !== 'select')
    throw new OptionError('Options can only be added to select-type attributes', 'not_select');

  const id = crypto.randomUUID();
  await db
    .insert(product_attribute_options)
    .values({ id, attribute_id: attributeId, value: input.value, sort_order: input.sort_order });
  return { id, attribute_id: attributeId, value: input.value, sort_order: input.sort_order };
}

export interface UpdateOptionInput {
  value?: string;
  sort_order?: number;
}

/** Update an option's value/sort_order. */
export async function updateOption(
  db: LibSQLDatabase,
  optionId: string,
  input: UpdateOptionInput
): Promise<{ id: string; value: string; sort_order: number }> {
  const [existing] = await db
    .select()
    .from(product_attribute_options)
    .where(eq(product_attribute_options.id, optionId));
  if (!existing) throw new OptionError('Option not found', 'not_found');

  const updateData: Record<string, any> = {};
  if (input.value !== undefined) updateData.value = input.value;
  if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;
  if (Object.keys(updateData).length > 0) {
    await db
      .update(product_attribute_options)
      .set(updateData)
      .where(eq(product_attribute_options.id, optionId));
  }
  return {
    id: optionId,
    value: input.value ?? existing.value,
    sort_order: input.sort_order ?? existing.sort_order,
  };
}

/** Delete an option. Rejects if any assignment references it in offered_option_ids. */
export async function deleteOption(db: LibSQLDatabase, optionId: string): Promise<void> {
  // Check usage in any assignment's offered_option_ids (JSON array stored as text)
  const assignments = await db.select().from(product_attribute_assignments);
  const hasUsage = assignments.some((a) => {
    try {
      const offered = JSON.parse(a.offered_option_ids || '[]');
      return offered.includes(optionId);
    } catch {
      return false;
    }
  });
  if (hasUsage)
    throw new OptionError(
      'Option is used in product assignments. Remove from products first.',
      'in_use'
    );

  await db.delete(product_attribute_options).where(eq(product_attribute_options.id, optionId));
}
