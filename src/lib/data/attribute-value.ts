/**
 * Shared attribute value shape and option value/label resolver.
 *
 * The five attribute builders (listVariants, batchEnrichPublicProducts,
 * enrichCartItems, listProductAttributeValues, listVariantAttributeValues) all
 * surface a variant/product attribute with a canonical `value` (the option's
 * `product_attribute_options.value` key — never a UUID) and a localized
 * `option_label` (translation.label ?? value). This module is the single source
 * of that shape and of the option value→label mapping, so the builders stay
 * consistent and drift-free.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray } from 'drizzle-orm';
import { product_attribute_options, translations } from '../../db/schema.ts';

export interface AttributeValue {
  attribute_id: string;
  attribute_name: string;
  attribute_type: string;
  role: string;
  /** The selected option UUID (select type only). */
  option_id?: string | null;
  /** The canonical value (option.value key), or value_text/value_number/value_boolean. */
  value: string | number | boolean | null;
  /** Localized display label (translation.label ?? value) — select type only. */
  option_label?: string | null;
}

export interface OptionValueLabel {
  /** The canonical `product_attribute_options.value` key. */
  value: string;
  /** The localized label (translation.label ?? value). */
  label: string;
}

/**
 * Map a set of option UUIDs to their canonical `value` and localized `label`
 * for the given locale. `label` falls back to `value` when no
 * `product_attribute_option` translation exists for that locale.
 *
 * Returns an empty map for empty input. Unknown option ids are omitted.
 */
export async function resolveOptionValueLabels(
  db: LibSQLDatabase,
  optionIds: string[],
  locale: string
): Promise<Map<string, OptionValueLabel>> {
  if (optionIds.length === 0) return new Map();

  const opts = await db
    .select()
    .from(product_attribute_options)
    .where(inArray(product_attribute_options.id, optionIds));
  if (opts.length === 0) return new Map();

  const transRows = await db
    .select()
    .from(translations)
    .where(inArray(translations.entity_id, optionIds));
  const labelMap = new Map<string, string>();
  for (const t of transRows) {
    if (t.entity_type === 'product_attribute_option' && t.locale === locale && t.label) {
      labelMap.set(t.entity_id, t.label!);
    }
  }

  const out = new Map<string, OptionValueLabel>();
  for (const opt of opts) {
    out.set(opt.id, { value: opt.value, label: labelMap.get(opt.id) ?? opt.value });
  }
  return out;
}
