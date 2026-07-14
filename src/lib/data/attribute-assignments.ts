/**
 * Data accessors for product ↔ attribute assignments.
 *
 * Functions receive `db: LibSQLDatabase` as the first parameter.
 * Uses `inArray()` for IN clauses — never sql-dot-join.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, and, eq, count } from 'drizzle-orm';
import {
  products,
  product_attributes,
  product_attribute_assignments,
  product_attribute_options,
  product_attribute_values,
  product_variants,
  translations,
} from '../../db/schema.ts';

export interface AssignmentRow {
  id: string;
  product_id: string;
  attribute_id: string;
  attribute_name: string;
  attribute_type: string;
  role: string;
  sort_order: number;
  offered_options: { id: string; value: string; label: string; sort_order: number }[] | null;
}

export interface CreateAssignmentInput {
  product_id: string;
  attribute_id: string;
  role: 'dimension' | 'field';
  sort_order: number;
  offered_option_ids?: string[];
}

/** Conflict / validation errors thrown to the endpoint layer. */
export class AssignmentConflictError extends Error {
  code: 'not_found' | 'duplicate' | 'invalid_dimension' | 'has_variants' | 'conflict';
  constructor(
    message: string,
    code: 'not_found' | 'duplicate' | 'invalid_dimension' | 'has_variants' | 'conflict' = 'conflict'
  ) {
    super(message);
    this.code = code;
  }
}

/** List all attribute assignments for a product, enriched with attribute details + offered options. */
export async function listAssignments(
  db: LibSQLDatabase,
  productId: string,
  locale: string
): Promise<AssignmentRow[]> {
  const assignments = await db
    .select()
    .from(product_attribute_assignments)
    .where(eq(product_attribute_assignments.product_id, productId))
    .orderBy(product_attribute_assignments.sort_order);

  if (assignments.length === 0) {
    return [];
  }

  const attributeIds = assignments.map((a) => a.attribute_id);

  // Attribute details
  const attrs = await db
    .select()
    .from(product_attributes)
    .where(inArray(product_attributes.id, attributeIds));
  const attributesMap = new Map(attrs.map((a) => [a.id, a]));

  // Translations for attribute names
  const transRows = await db
    .select()
    .from(translations)
    .where(inArray(translations.entity_id, attributeIds));
  const transMap = new Map(
    transRows
      .filter((t) => t.entity_type === 'product_attribute' && t.locale === locale)
      .map((t) => [t.entity_id, t])
  );

  // Offered options for dimension assignments
  const dimensionAssignments = assignments.filter((a) => a.role === 'dimension');
  const optionsMap = new Map<string, AssignmentRow['offered_options']>([]);
  for (const assignment of dimensionAssignments) {
    let offeredIds: string[] = [];
    try {
      offeredIds = JSON.parse(assignment.offered_option_ids || '[]');
    } catch {
      offeredIds = [];
    }
    if (offeredIds.length === 0) {
      optionsMap.set(assignment.id, []);
      continue;
    }
    const options = await db
      .select()
      .from(product_attribute_options)
      .where(inArray(product_attribute_options.id, offeredIds))
      .orderBy(product_attribute_options.sort_order);

    const optIds = options.map((o) => o.id);
    const optTransRows =
      optIds.length > 0
        ? await db.select().from(translations).where(inArray(translations.entity_id, optIds))
        : [];
    const optTransMap = new Map(
      optTransRows
        .filter((t) => t.entity_type === 'product_attribute_option' && t.locale === locale)
        .map((t) => [t.entity_id, t])
    );

    optionsMap.set(
      assignment.id,
      options.map((o) => ({
        id: o.id,
        value: o.value,
        label: optTransMap.get(o.id)?.label ?? o.value,
        sort_order: o.sort_order,
      }))
    );
  }

  return assignments.map((a) => {
    const attr = attributesMap.get(a.attribute_id);
    const trans = transMap.get(a.attribute_id);
    return {
      id: a.id,
      product_id: a.product_id,
      attribute_id: a.attribute_id,
      attribute_name: trans?.name ?? attr?.name ?? '',
      attribute_type: attr?.type ?? '',
      role: a.role,
      sort_order: a.sort_order,
      offered_options: a.role === 'dimension' ? optionsMap.get(a.id) || [] : null,
    };
  });
}

/** Create a new attribute assignment with validation (non-select-as-dimension, duplicates). */
export async function createAssignment(
  db: LibSQLDatabase,
  input: CreateAssignmentInput
): Promise<{ id: string }> {
  // Verify product exists
  const [product] = await db.select().from(products).where(eq(products.id, input.product_id));
  if (!product) throw new AssignmentConflictError('Product not found', 'not_found');

  // Verify attribute exists
  const [attr] = await db
    .select()
    .from(product_attributes)
    .where(eq(product_attributes.id, input.attribute_id));
  if (!attr) throw new AssignmentConflictError('Attribute not found', 'not_found');

  // Check duplicate
  const existing = await db
    .select()
    .from(product_attribute_assignments)
    .where(
      and(
        eq(product_attribute_assignments.product_id, input.product_id),
        eq(product_attribute_assignments.attribute_id, input.attribute_id)
      )
    );
  if (existing.length > 0)
    throw new AssignmentConflictError('Attribute is already assigned to this product', 'duplicate');

  // Dimension role validation: the offered_option_ids subset is NO LONGER
  // required (assigning a dimension is one click; the merchant prunes at the
  // Manage Variants matrix, which uses the full option set). The column is
  // stored as-is (empty array is fine). Options are validated to belong to the
  // attribute ONLY if provided.
  if (input.role === 'dimension') {
    if (attr.type !== 'select') {
      throw new AssignmentConflictError(
        'Only select-type attributes can be used as dimensions',
        'invalid_dimension'
      );
    }
    if (input.offered_option_ids && input.offered_option_ids.length > 0) {
      const globalOptions = await db
        .select()
        .from(product_attribute_options)
        .where(eq(product_attribute_options.attribute_id, attr.id));
      const globalOptionIds = globalOptions.map((o) => o.id);
      const invalid = input.offered_option_ids.filter((id) => !globalOptionIds.includes(id));
      if (invalid.length > 0) {
        throw new AssignmentConflictError(
          `Some offered options do not belong to this attribute: ${invalid.join(', ')}`,
          'invalid_dimension'
        );
      }
    }
  }

  const id = crypto.randomUUID();
  await db.insert(product_attribute_assignments).values({
    id,
    product_id: input.product_id,
    attribute_id: input.attribute_id,
    role: input.role,
    sort_order: input.sort_order,
    offered_option_ids: JSON.stringify(input.offered_option_ids || []),
  });
  return { id };
}

/** Delete an assignment. Rejects dimension assignments whose product has variants. */
export async function deleteAssignment(db: LibSQLDatabase, assignmentId: string): Promise<void> {
  const [assignment] = await db
    .select()
    .from(product_attribute_assignments)
    .where(eq(product_attribute_assignments.id, assignmentId));

  if (!assignment) throw new AssignmentConflictError('Assignment not found', 'not_found');

  if (assignment.role === 'dimension') {
    const variants = await db
      .select()
      .from(product_variants)
      .where(eq(product_variants.product_id, assignment.product_id));
    if (variants.length > 0) {
      throw new AssignmentConflictError(
        'Cannot remove dimension attribute that has existing variants. Delete variants first.',
        'has_variants'
      );
    }
  }

  // Delete attribute values for this assignment (both product and variant level)
  await db
    .delete(product_attribute_values)
    .where(eq(product_attribute_values.assignment_id, assignmentId));
  await db
    .delete(product_attribute_assignments)
    .where(eq(product_attribute_assignments.id, assignmentId));
}

/** Count how many products each attribute is assigned to.
 * Returns a Map of attribute_id → count. Skips attributes with 0 assignments. */
export async function countAssignmentsByAttributeIds(
  db: LibSQLDatabase,
  attributeIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (attributeIds.length === 0) return result;

  const rows = await db
    .select({ attribute_id: product_attribute_assignments.attribute_id, cnt: count() })
    .from(product_attribute_assignments)
    .where(inArray(product_attribute_assignments.attribute_id, attributeIds))
    .groupBy(product_attribute_assignments.attribute_id);

  for (const row of rows) {
    result.set(row.attribute_id, Number(row.cnt));
  }
  return result;
}
