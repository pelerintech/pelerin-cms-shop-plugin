/**
 * Data accessors for product variants.
 *
 * Functions receive `db: LibSQLDatabase` as the first parameter.
 * Uses `inArray()` — never sql-dot-join (this module fixes the live 500 on
 * GET /api/plugins/shop/products/[id]/variants).
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, eq, and, isNull } from 'drizzle-orm';
import {
  product_variants,
  product_attribute_values,
  product_attribute_assignments,
  product_attributes,
  product_attribute_options,
  product_prices,
  translations,
} from '../../db/schema.ts';

export interface VariantAttribute {
  attribute_id: string;
  attribute_name: string;
  attribute_type: string;
  role: string;
  value: string | number | boolean | null;
  /** The option_id for select-type dimension values (used by the Manage Variants
   *  matrix to detect existing combinations). Null for text/number/boolean. */
  option_id?: string | null;
}

export interface VariantRow {
  id: string;
  product_id: string;
  sku: string | null;
  stock: number | null;
  active: boolean;
  attributes: VariantAttribute[];
  prices: { currency: string; price_net: number }[];
  /** Effective prices per currency = own row else product's row (independently inherited). */
  effective_prices: EffectivePrice[];
}

export interface EffectivePrice {
  currency: string;
  price_net: number;
  inherited: boolean;
}

/**
 * Per-currency variant price inheritance.
 *
 * For each currency the product defines a price for, the variant's effective
 * price = its own `product_prices` row for that currency if one exists, else the
 * product's row. Each currency inherits independently. `inherited` is true when
 * the variant has no own row for that currency (it falls back to the product).
 *
 * If the product has no prices and the variant has no prices, returns [].
 */
export async function getEffectiveVariantPrices(
  db: LibSQLDatabase,
  variantId: string,
  productId: string,
): Promise<EffectivePrice[]> {
  // Product-level prices (variant_id IS NULL, product_id = productId)
  const productPrices = await db
    .select()
    .from(product_prices)
    .where(and(eq(product_prices.product_id, productId), isNull(product_prices.variant_id)));
  // Variant-level prices (variant_id = variantId)
  const variantPrices = await db
    .select()
    .from(product_prices)
    .where(eq(product_prices.variant_id, variantId));

  const variantByCurrency = new Map(variantPrices.map(p => [p.currency, p.price_net]));

  // Currencies are the union of product + variant currencies, but a variant can
  // only inherit a currency the product defines. A variant with an own row for a
  // currency the product doesn't define is still surfaced (own override).
  const currencies = new Set<string>([
    ...productPrices.map(p => p.currency),
    ...variantPrices.map(p => p.currency),
  ]);

  const out: EffectivePrice[] = [];
  for (const currency of currencies) {
    const own = variantByCurrency.get(currency);
    if (own !== undefined) {
      out.push({ currency, price_net: own, inherited: false });
      continue;
    }
    const prod = productPrices.find(p => p.currency === currency);
    if (prod) {
      out.push({ currency, price_net: prod.price_net, inherited: true });
    }
  }
  return out;
}

/**
 * Coalesce a variant's own price rows with the product's price-by-currency map
 * into effective prices. Each currency inherits independently: own row if it
 * exists, else the product's. Used by `listVariants` (batched — the product map
 * is fetched once and reused across all variants).
 */
function computeEffectivePrices(
  ownPrices: { currency: string; price_net: number }[],
  productPriceByCurrency: Map<string, number>,
): EffectivePrice[] {
  const ownByCurrency = new Map(ownPrices.map(p => [p.currency, p.price_net]));
  const currencies = new Set<string>([
    ...productPriceByCurrency.keys(),
    ...ownByCurrency.keys(),
  ]);
  const out: EffectivePrice[] = [];
  for (const currency of currencies) {
    const own = ownByCurrency.get(currency);
    if (own !== undefined) {
      out.push({ currency, price_net: own, inherited: false });
      continue;
    }
    const prod = productPriceByCurrency.get(currency);
    if (prod !== undefined) {
      out.push({ currency, price_net: prod, inherited: true });
    }
  }
  return out;
}

/** List all variants for a product, enriched with dimension attribute values and prices. */
export async function listVariants(
  db: LibSQLDatabase,
  productId: string,
  locale: string,
): Promise<VariantRow[]> {
  const variants = await db
    .select()
    .from(product_variants)
    .where(eq(product_variants.product_id, productId));

  if (variants.length === 0) {
    return [];
  }

  const variantIds = variants.map(v => v.id);

  // Variant-level attribute values (inArray — this is the live-500 fix)
  const allVav = await db
    .select()
    .from(product_attribute_values)
    .where(
      inArray(product_attribute_values.entity_id, variantIds),
    );
  const variantAttrValues = allVav.filter(v => v.entity_type === 'variant');

  // Variant prices
  const allVp = await db
    .select()
    .from(product_prices)
    .where(inArray(product_prices.variant_id, variantIds));

  // Product-level prices (variant_id IS NULL, product_id = productId) — for
  // per-currency inheritance. Fetched once and coalesced in memory per variant.
  const productPrices = await db
    .select()
    .from(product_prices)
    .where(and(eq(product_prices.product_id, productId), isNull(product_prices.variant_id)));
  const productPriceByCurrency = new Map(productPrices.map(p => [p.currency, p.price_net]));

  // Assignment details for the values
  const assignmentIds = Array.from(new Set(variantAttrValues.map(v => v.assignment_id)));
  const assignmentsMap = new Map<string, any>();
  if (assignmentIds.length > 0) {
    const assignments = await db
      .select()
      .from(product_attribute_assignments)
      .where(inArray(product_attribute_assignments.id, assignmentIds));
    for (const a of assignments) assignmentsMap.set(a.id, a);
  }

  // Attribute details
  const attributeIds = Array.from(new Set(Array.from(assignmentsMap.values()).map(a => a.attribute_id)));
  const attributesMap = new Map<string, any>();
  const attrTransMap = new Map<string, string>();
  if (attributeIds.length > 0) {
    const attrs = await db.select().from(product_attributes).where(inArray(product_attributes.id, attributeIds));
    for (const attr of attrs) attributesMap.set(attr.id, attr);
    const transRows = await db.select().from(translations).where(inArray(translations.entity_id, attributeIds));
    for (const t of transRows) {
      if (t.entity_type === 'product_attribute' && t.locale === locale && t.name) {
        attrTransMap.set(t.entity_id, t.name);
      }
    }
  }

  // Option labels for select-type values
  const optionIds = Array.from(new Set(variantAttrValues.map(v => v.option_id).filter(Boolean) as string[]));
  const optionLabelsMap = new Map<string, string>();
  if (optionIds.length > 0) {
    const optTransRows = await db.select().from(translations).where(inArray(translations.entity_id, optionIds));
    for (const t of optTransRows) {
      if (t.entity_type === 'product_attribute_option' && t.locale === locale && t.label) {
        optionLabelsMap.set(t.entity_id, t.label);
      }
    }
  }

  return variants.map(v => {
    const vav = variantAttrValues.filter(val => val.entity_id === v.id);
    const vp = allVp.filter(p => p.variant_id === v.id);

    const attributes: VariantAttribute[] = vav.map(val => {
      const assignment = assignmentsMap.get(val.assignment_id);
      const attr = assignment ? attributesMap.get(assignment.attribute_id) : null;
      const attrName = attr ? (attrTransMap.get(attr.id) || attr.name) : '';
      let value: string | number | boolean | null = null;
      if (val.option_id) {
        value = optionLabelsMap.get(val.option_id) || val.option_id;
      } else if (val.value_text !== null) {
        value = val.value_text;
      } else if (val.value_number !== null) {
        value = val.value_number;
      } else if (val.value_boolean !== null) {
        value = val.value_boolean;
      }
      return {
        attribute_id: attr?.id || '',
        attribute_name: attrName,
        attribute_type: attr?.type || '',
        role: assignment?.role || '',
        value,
        option_id: val.option_id ?? null,
      };
    });

    return {
      id: v.id,
      product_id: v.product_id,
      sku: v.sku,
      stock: v.stock,
      active: v.active,
      attributes,
      prices: vp.map(p => ({ currency: p.currency, price_net: p.price_net })),
      effective_prices: computeEffectivePrices(vp, productPriceByCurrency),
    };
  });
}

/** List all variant IDs for a product. */
export async function listVariantIdsForProduct(db: LibSQLDatabase, productId: string): Promise<string[]> {
  const rows = await db.select().from(product_variants).where(eq(product_variants.product_id, productId));
  return rows.map(v => v.id);
}

/** Find a variant by its SKU (case-sensitive). Returns null if not found. */
export async function findVariantBySku(
  db: LibSQLDatabase,
  sku: string,
): Promise<{ id: string; product_id: string; sku: string | null; stock: number | null; active: boolean } | null> {
  const [variant] = await db.select().from(product_variants).where(eq(product_variants.sku, sku));
  return (variant as any) ?? null;
}

export interface VariantCombination {
  option_ids: string[];
  sku?: string | null;
  stock?: number | null;
  active?: boolean;
}

export class VariantError extends Error {
  code: 'not_found' | 'duplicate_combination';
  constructor(message: string, code: 'not_found' | 'duplicate_combination' = 'not_found') {
    super(message);
    this.code = code;
  }
}

/** Create variants from dimension-option combinations. */
export async function createVariants(
  db: LibSQLDatabase,
  productId: string,
  combinations: VariantCombination[],
): Promise<{ id: string; sku: string | null; stock: number | null; active: boolean; option_ids: string[] }[]> {
  // Fetch dimension assignments for this product
  const assignments = await db
    .select()
    .from(product_attribute_assignments)
    .where(
      and(
        eq(product_attribute_assignments.product_id, productId),
        eq(product_attribute_assignments.role, 'dimension'),
      ),
    );

  // Build map: option_id → assignment_id using ALL options of each dimension
  // attribute (NOT the offered_option_ids subset). The offered_option_ids
  // column is ignored for generation — assigning a dimension is one click, and
  // the merchant prunes at the Manage Variants matrix.
  const assignmentOptionMap = new Map<string, string>();
  const dimensionAttrIds = assignments.map(a => a.attribute_id);
  if (dimensionAttrIds.length > 0) {
    const allOptions = await db
      .select()
      .from(product_attribute_options)
      .where(inArray(product_attribute_options.attribute_id, dimensionAttrIds));
    // Map each option to its assignment (attribute_id → assignment_id).
    const attrIdToAssignmentId = new Map(assignments.map(a => [a.attribute_id, a.id]));
    for (const opt of allOptions) {
      const assignmentId = attrIdToAssignmentId.get(opt.attribute_id);
      if (assignmentId) assignmentOptionMap.set(opt.id, assignmentId);
    }
  }

  // Check for duplicate combinations against existing variants
  const existingVariants = await db.select().from(product_variants).where(eq(product_variants.product_id, productId));
  const existingVariantIds = existingVariants.map(v => v.id);
  const existingValues = new Map<string, Set<string>>();
  if (existingVariantIds.length > 0) {
    const vavRows = await db
      .select()
      .from(product_attribute_values)
      .where(inArray(product_attribute_values.entity_id, existingVariantIds));
    const variantVav = vavRows.filter(v => v.entity_type === 'variant');
    for (const row of variantVav) {
      if (!existingValues.has(row.entity_id)) existingValues.set(row.entity_id, new Set());
      if (row.option_id) existingValues.get(row.entity_id)!.add(row.option_id);
    }
  }

  const created: { id: string; sku: string | null; stock: number | null; active: boolean; option_ids: string[] }[] = [];

  for (const combo of combinations) {
    const comboSet = new Set(combo.option_ids);
    for (const [vId, optSet] of existingValues) {
      if (optSet.size === comboSet.size && [...optSet].every(id => comboSet.has(id))) {
        throw new VariantError('Duplicate variant combination', 'duplicate_combination');
      }
    }

    const variantId = crypto.randomUUID();
    await db.insert(product_variants).values({
      id: variantId,
      product_id: productId,
      sku: combo.sku || null,
      stock: combo.stock ?? null,
      active: combo.active !== undefined ? combo.active : true,
    });

    for (const optionId of combo.option_ids) {
      const assignmentId = assignmentOptionMap.get(optionId);
      if (assignmentId) {
        await db.insert(product_attribute_values).values({
          id: crypto.randomUUID(),
          entity_type: 'variant',
          entity_id: variantId,
          assignment_id: assignmentId,
          option_id: optionId,
          value_text: null,
          value_number: null,
          value_boolean: null,
        });
      }
    }

    existingValues.set(variantId, comboSet);
    created.push({
      id: variantId,
      sku: combo.sku ?? null,
      stock: combo.stock ?? null,
      active: combo.active !== undefined ? combo.active : true,
      option_ids: combo.option_ids,
    });
  }

  return created;
}

export interface UpdateVariantInput {
  sku?: string | null;
  stock?: number | null;
  active?: boolean;
  field_values?: { assignment_id: string; option_id?: string | null; value_text?: string | null; value_number?: number | null; value_boolean?: boolean | null }[];
  /**
   * Per-currency variant price overrides. For each entry:
   * - `price_net` is a number → UPSERT the variant's `product_prices` row for that currency.
   * - `price_net` is `null` → DELETE the variant's row for that currency (revert to inherit).
   * Currencies not listed are left unchanged.
   */
  prices?: { currency: string; price_net: number | null }[];
}

/** Update a variant's fields and optionally upsert field-role values. */
export async function updateVariant(
  db: LibSQLDatabase,
  variantId: string,
  input: UpdateVariantInput,
): Promise<{ id: string; product_id: string; sku: string | null; stock: number | null; active: boolean }> {
  const [existing] = await db.select().from(product_variants).where(eq(product_variants.id, variantId));
  if (!existing) throw new VariantError('Variant not found', 'not_found');

  const updateData: Record<string, any> = {};
  if (input.sku !== undefined) updateData.sku = input.sku;
  if (input.stock !== undefined) updateData.stock = input.stock;
  if (input.active !== undefined) updateData.active = input.active;
  if (Object.keys(updateData).length > 0) {
    await db.update(product_variants).set(updateData).where(eq(product_variants.id, variantId));
  }

  if (input.prices && Array.isArray(input.prices)) {
    for (const price of input.prices) {
      if (price.price_net === null) {
        // Revert to inherit: delete the variant's row for this currency (if any).
        await db.delete(product_prices).where(
          and(eq(product_prices.variant_id, variantId), eq(product_prices.currency, price.currency)),
        );
      } else {
        // Override: upsert the variant's row for this currency.
        const [existingPrice] = await db
          .select()
          .from(product_prices)
          .where(
            and(eq(product_prices.variant_id, variantId), eq(product_prices.currency, price.currency)),
          );
        if (existingPrice) {
          await db.update(product_prices)
            .set({ price_net: price.price_net })
            .where(eq(product_prices.id, existingPrice.id));
        } else {
          await db.insert(product_prices).values({
            id: crypto.randomUUID(),
            product_id: null,
            variant_id: variantId,
            currency: price.currency,
            price_net: price.price_net,
          });
        }
      }
    }
  }

  if (input.field_values && Array.isArray(input.field_values)) {
    for (const fv of input.field_values) {
      // Validate assignment belongs to this product and is field role
      const [assignment] = await db
        .select()
        .from(product_attribute_assignments)
        .where(
          and(
            eq(product_attribute_assignments.id, fv.assignment_id),
            eq(product_attribute_assignments.product_id, existing.product_id),
            eq(product_attribute_assignments.role, 'field'),
          ),
        );
      if (!assignment) continue;

      const [existingValue] = await db
        .select()
        .from(product_attribute_values)
        .where(
          and(
            eq(product_attribute_values.entity_type, 'variant'),
            eq(product_attribute_values.entity_id, variantId),
            eq(product_attribute_values.assignment_id, fv.assignment_id),
          ),
        );

      if (existingValue) {
        await db.update(product_attribute_values)
          .set({
            option_id: fv.option_id ?? null,
            value_text: fv.value_text ?? null,
            value_number: fv.value_number ?? null,
            value_boolean: fv.value_boolean ?? null,
          })
          .where(eq(product_attribute_values.id, existingValue.id));
      } else {
        await db.insert(product_attribute_values).values({
          id: crypto.randomUUID(),
          entity_type: 'variant',
          entity_id: variantId,
          assignment_id: fv.assignment_id,
          option_id: fv.option_id ?? null,
          value_text: fv.value_text ?? null,
          value_number: fv.value_number ?? null,
          value_boolean: fv.value_boolean ?? null,
        });
      }
    }
  }

  const [updated] = await db.select().from(product_variants).where(eq(product_variants.id, variantId));
  return updated;
}

/** Delete a variant and its attribute values + prices. */
export async function deleteVariant(
  db: LibSQLDatabase,
  variantId: string,
): Promise<void> {
  const [existing] = await db.select().from(product_variants).where(eq(product_variants.id, variantId));
  if (!existing) throw new VariantError('Variant not found', 'not_found');

  await db.delete(product_attribute_values)
    .where(and(eq(product_attribute_values.entity_type, 'variant'), eq(product_attribute_values.entity_id, variantId)));
  await db.delete(product_prices).where(eq(product_prices.variant_id, variantId));
  await db.delete(product_variants).where(eq(product_variants.id, variantId));
}
