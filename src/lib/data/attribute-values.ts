/**
 * Data accessors for product-level (and variant-level) attribute field values.
 *
 * Functions receive `db: LibSQLDatabase` as the first parameter.
 * Uses `inArray()` — never sql-dot-join.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, eq, and } from 'drizzle-orm';
import {
  products,
  product_variants,
  product_attribute_values,
  product_attribute_assignments,
  product_attributes,
  product_attribute_options,
  translations,
} from '../../db/schema.ts';

export interface AttributeValueRow {
  assignment_id: string;
  attribute_id: string;
  attribute_name: string;
  attribute_type: string;
  value: string | number | boolean | null;
}

export interface UpsertValueInput {
  entity_type: 'product' | 'variant';
  entity_id: string;
  assignment_id: string;
  option_id?: string | null;
  value_text?: string | null;
  value_number?: number | null;
  value_boolean?: boolean | null;
}

export class AttributeValueError extends Error {
  code: 'not_found' | 'invalid_assignment';
  constructor(message: string, code: 'not_found' | 'invalid_assignment' = 'invalid_assignment') {
    super(message);
    this.code = code;
  }
}

/** List field-role attribute values for a product (entity_type='product'). */
export async function listProductAttributeValues(
  db: LibSQLDatabase,
  productId: string,
  locale: string
): Promise<AttributeValueRow[]> {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) return [];

  // Fetch field-role assignments for this product
  const assignments = await db
    .select()
    .from(product_attribute_assignments)
    .where(
      and(
        eq(product_attribute_assignments.product_id, productId),
        eq(product_attribute_assignments.role, 'field')
      )
    )
    .orderBy(product_attribute_assignments.sort_order);

  if (assignments.length === 0) return [];

  const assignmentIds = assignments.map((a) => a.id);

  // Fetch existing product-level values
  const allVals = await db
    .select()
    .from(product_attribute_values)
    .where(
      and(
        eq(product_attribute_values.entity_type, 'product'),
        eq(product_attribute_values.entity_id, productId)
      )
    );
  const values = allVals.filter((v) => assignmentIds.includes(v.assignment_id));

  // Attribute details
  const attributeIds = Array.from(new Set(assignments.map((a) => a.attribute_id)));
  const attrs = await db
    .select()
    .from(product_attributes)
    .where(inArray(product_attributes.id, attributeIds));
  const attributesMap = new Map(attrs.map((a) => [a.id, a]));

  const transRows = await db
    .select()
    .from(translations)
    .where(inArray(translations.entity_id, attributeIds));
  const attrTransMap = new Map(
    transRows
      .filter((t) => t.entity_type === 'product_attribute' && t.locale === locale)
      .map((t) => [t.entity_id, t.name])
  );

  // Option labels for select-type values
  const optionIds = Array.from(new Set(values.map((v) => v.option_id).filter(Boolean) as string[]));
  const optionLabelsMap = new Map<string, string>();
  if (optionIds.length > 0) {
    const optTransRows = await db
      .select()
      .from(translations)
      .where(inArray(translations.entity_id, optionIds));
    for (const t of optTransRows) {
      if (t.entity_type === 'product_attribute_option' && t.locale === locale && t.label) {
        optionLabelsMap.set(t.entity_id, t.label);
      }
    }
  }

  return assignments.map((a) => {
    const attr = attributesMap.get(a.attribute_id);
    const val = values.find((v) => v.assignment_id === a.id);
    let value: string | number | boolean | null = null;
    if (val) {
      if (val.option_id) {
        value = optionLabelsMap.get(val.option_id) || val.option_id;
      } else if (val.value_text !== null) {
        value = val.value_text;
      } else if (val.value_number !== null) {
        value = val.value_number;
      } else if (val.value_boolean !== null) {
        value = val.value_boolean;
      }
    }
    return {
      assignment_id: a.id,
      attribute_id: a.attribute_id,
      attribute_name: attrTransMap.get(a.attribute_id) || attr?.name || '',
      attribute_type: attr?.type || '',
      value,
      option_id: val?.option_id ?? null,
    };
  });
}

/** Upsert a single attribute value (insert if none exists, update otherwise). */
export async function upsertProductAttributeValue(
  db: LibSQLDatabase,
  input: UpsertValueInput
): Promise<void> {
  // Validate assignment belongs to the entity and is field role
  const [assignment] = await db
    .select()
    .from(product_attribute_assignments)
    .where(eq(product_attribute_assignments.id, input.assignment_id));

  if (!assignment) throw new AttributeValueError('Assignment not found', 'not_found');
  if (assignment.role !== 'field') {
    throw new AttributeValueError(
      `Assignment ${input.assignment_id} is not a field role`,
      'invalid_assignment'
    );
  }
  // For product-level, assignment.product_id must match entity_id
  if (input.entity_type === 'product' && assignment.product_id !== input.entity_id) {
    throw new AttributeValueError(
      `Assignment does not belong to entity ${input.entity_id}`,
      'invalid_assignment'
    );
  }

  const [existing] = await db
    .select()
    .from(product_attribute_values)
    .where(
      and(
        eq(product_attribute_values.entity_type, input.entity_type),
        eq(product_attribute_values.entity_id, input.entity_id),
        eq(product_attribute_values.assignment_id, input.assignment_id)
      )
    );

  if (existing) {
    await db
      .update(product_attribute_values)
      .set({
        option_id: input.option_id ?? null,
        value_text: input.value_text ?? null,
        value_number: input.value_number ?? null,
        value_boolean: input.value_boolean ?? null,
      })
      .where(eq(product_attribute_values.id, existing.id));
  } else {
    await db.insert(product_attribute_values).values({
      id: crypto.randomUUID(),
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      assignment_id: input.assignment_id,
      option_id: input.option_id ?? null,
      value_text: input.value_text ?? null,
      value_number: input.value_number ?? null,
      value_boolean: input.value_boolean ?? null,
    });
  }
}

/** Upsert a variant-level attribute value. Validates the assignment belongs to the variant's product. */
export async function upsertVariantAttributeValue(
  db: LibSQLDatabase,
  variantId: string,
  input: {
    assignment_id: string;
    option_id?: string | null;
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
  }
): Promise<void> {
  const [variant] = await db
    .select()
    .from(product_variants)
    .where(eq(product_variants.id, variantId));
  if (!variant) throw new AttributeValueError('Variant not found', 'not_found');

  const [assignment] = await db
    .select()
    .from(product_attribute_assignments)
    .where(
      and(
        eq(product_attribute_assignments.id, input.assignment_id),
        eq(product_attribute_assignments.product_id, variant.product_id),
        eq(product_attribute_assignments.role, 'field')
      )
    );
  if (!assignment) {
    throw new AttributeValueError(
      `Assignment ${input.assignment_id} does not belong to this variant's product or is not a field role`,
      'invalid_assignment'
    );
  }

  await upsertProductAttributeValue(db, {
    entity_type: 'variant',
    entity_id: variantId,
    assignment_id: input.assignment_id,
    option_id: input.option_id,
    value_text: input.value_text,
    value_number: input.value_number,
    value_boolean: input.value_boolean,
  });
}

/** List field-role attribute values for a variant (entity_type='variant'). */
export async function listVariantAttributeValues(
  db: LibSQLDatabase,
  variantId: string,
  locale: string
): Promise<AttributeValueRow[]> {
  const [variant] = await db
    .select()
    .from(product_variants)
    .where(eq(product_variants.id, variantId));
  if (!variant) return [];

  const assignments = await db
    .select()
    .from(product_attribute_assignments)
    .where(
      and(
        eq(product_attribute_assignments.product_id, variant.product_id),
        eq(product_attribute_assignments.role, 'field')
      )
    )
    .orderBy(product_attribute_assignments.sort_order);

  if (assignments.length === 0) return [];

  const assignmentIds = assignments.map((a) => a.id);
  const allVals = await db
    .select()
    .from(product_attribute_values)
    .where(
      and(
        eq(product_attribute_values.entity_type, 'variant'),
        eq(product_attribute_values.entity_id, variantId)
      )
    );
  const values = allVals.filter((v) => assignmentIds.includes(v.assignment_id));

  const attributeIds = Array.from(new Set(assignments.map((a) => a.attribute_id)));
  const attrs = await db
    .select()
    .from(product_attributes)
    .where(inArray(product_attributes.id, attributeIds));
  const attributesMap = new Map(attrs.map((a) => [a.id, a]));

  const transRows = await db
    .select()
    .from(translations)
    .where(inArray(translations.entity_id, attributeIds));
  const attrTransMap = new Map(
    transRows
      .filter((t) => t.entity_type === 'product_attribute' && t.locale === locale)
      .map((t) => [t.entity_id, t.name])
  );

  const optionIds = Array.from(new Set(values.map((v) => v.option_id).filter(Boolean) as string[]));
  const optionLabelsMap = new Map<string, string>();
  if (optionIds.length > 0) {
    const optTransRows = await db
      .select()
      .from(translations)
      .where(inArray(translations.entity_id, optionIds));
    for (const t of optTransRows) {
      if (t.entity_type === 'product_attribute_option' && t.locale === locale && t.label) {
        optionLabelsMap.set(t.entity_id, t.label);
      }
    }
  }

  return assignments.map((a) => {
    const attr = attributesMap.get(a.attribute_id);
    const val = values.find((v) => v.assignment_id === a.id);
    let value: string | number | boolean | null = null;
    if (val) {
      if (val.option_id) {
        value = optionLabelsMap.get(val.option_id) || val.option_id;
      } else if (val.value_text !== null) {
        value = val.value_text;
      } else if (val.value_number !== null) {
        value = val.value_number;
      } else if (val.value_boolean !== null) {
        value = val.value_boolean;
      }
    }
    return {
      assignment_id: a.id,
      attribute_id: a.attribute_id,
      attribute_name: attrTransMap.get(a.attribute_id) || attr?.name || '',
      attribute_type: attr?.type || '',
      value,
    };
  });
}
