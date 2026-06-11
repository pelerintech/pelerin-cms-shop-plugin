import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  db,
  product_variants,
  product_attribute_values,
  product_attribute_assignments,
  product_attributes,
  product_attribute_options,
  product_prices,
  translations,
  sql as dbSql,
} from 'astro:db';

/**
 * Schema for creating variants via combinations
 * Each combination = one variant with its dimension option_ids
 */
const CreateVariantsBodySchema = {
  parse: (body: any) => {
    if (!body.combinations || !Array.isArray(body.combinations)) {
      return { success: false, issues: [{ path: ['combinations'], message: 'combinations array is required' }] };
    }
    for (let i = 0; i < body.combinations.length; i++) {
      const combo = body.combinations[i];
      if (!combo.option_ids || !Array.isArray(combo.option_ids) || combo.option_ids.length === 0) {
        return { success: false, issues: [{ path: ['combinations', i, 'option_ids'], message: 'Each combination must have at least one option_id' }] };
      }
    }
    return { success: true, data: body };
  },
};

/**
 * Resolve option label for a given locale, falling back to value.
 */
async function resolveOptionLabel(optionId: string, locale: string): Promise<string> {
  const transResult = await db
    .select()
    .from(translations)
    .where(
      dbSql`${translations.entity_type} = 'product_attribute_option' AND ${translations.entity_id} = ${optionId} AND ${translations.locale} = ${locale}`
    );
  const translated = transResult.find(t => t.label);
  return translated?.label ?? '';
}

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const productId = context.params.id!;
    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    const variants = await db
      .select()
      .from(product_variants)
      .where(dbSql`${product_variants.product_id} = ${productId}`);

    // Fetch variant-level attribute values
    let variantAttrValues: any[] = [];
    let variantPrices: any[] = [];

    if (variants.length > 0) {
      const variantIds = variants.map(v => v.id);

      const vavResult = await db.run(
        dbSql`SELECT * FROM ${product_attribute_values} WHERE ${product_attribute_values.entity_type} = 'variant' AND ${product_attribute_values.entity_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantAttrValues = vavResult.rows as any[];

      const vpResult = await db.run(
        dbSql`SELECT * FROM ${product_prices} WHERE ${product_prices.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantPrices = vpResult.rows as any[];
    }

    // Fetch assignment details for the values
    const assignmentIds = Array.from(new Set(variantAttrValues.map(v => v.assignment_id)));
    const assignmentsMap = new Map<string, any>();
    if (assignmentIds.length > 0) {
      const assignments = await db
        .select()
        .from(product_attribute_assignments)
        .where(
          dbSql`${product_attribute_assignments.id} IN (${dbSql.join(assignmentIds.map(id => dbSql`${id}`))})`
        );
      for (const a of assignments) {
        assignmentsMap.set(a.id, a);
      }
    }

    // Fetch attribute details
    const attributeIds = Array.from(new Set(
      Array.from(assignmentsMap.values()).map(a => a.attribute_id)
    ));
    const attributesMap = new Map<string, any>();
    const attrTransMap = new Map<string, string>();
    if (attributeIds.length > 0) {
      const attrs = await db
        .select()
        .from(product_attributes)
        .where(
          dbSql`${product_attributes.id} IN (${dbSql.join(attributeIds.map(id => dbSql`${id}`))})`
        );
      for (const attr of attrs) {
        attributesMap.set(attr.id, attr);
      }

      // Fetch translations for attribute names
      const transRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(attributeIds.map(id => dbSql`${id}`))})`
        );
      for (const t of transRows) {
        if (t.name) attrTransMap.set(t.entity_id, t.name);
      }
    }

    // Fetch option labels for select-type values
    const optionIds = Array.from(new Set(
      variantAttrValues.filter(v => v.option_id).map(v => v.option_id)
    ));
    const optionLabelsMap = new Map<string, string>();
    if (optionIds.length > 0) {
      for (const optId of optionIds) {
        const label = await resolveOptionLabel(optId, locale);
        if (label) optionLabelsMap.set(optId, label);
      }
    }

    // Enrich variants
    const enriched = variants.map(v => {
      const vav = variantAttrValues.filter(val => val.entity_id === v.id);
      const vp = variantPrices.filter(p => p.variant_id === v.id);

      const attributes = vav.map(val => {
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
      };
    });

    return new Response(JSON.stringify({ success: true, data: enriched }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const productId = context.params.id!;

    const body = await context.request.json();
    const validationResult = CreateVariantsBodySchema.parse(body);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(
            validationResult.issues.map(i => [i.path.join('.'), i.message])
          ),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { combinations } = validationResult.data;

    // Fetch dimension assignments for this product
    const assignments = await db
      .select()
      .from(product_attribute_assignments)
      .where(
        dbSql`${product_attribute_assignments.product_id} = ${productId} AND ${product_attribute_assignments.role} = 'dimension'`
      );

    // Build map: option_id → assignment_id (for dimension values)
    const assignmentOptionMap = new Map<string, string>();
    for (const assignment of assignments) {
      try {
        const offeredIds = JSON.parse(assignment.offered_option_ids || '[]');
        for (const optId of offeredIds) {
          assignmentOptionMap.set(optId, assignment.id);
        }
      } catch {}
    }

    // Check for duplicate combinations against existing variants
    const existingVariants = await db
      .select()
      .from(product_variants)
      .where(dbSql`${product_variants.product_id} = ${productId}`);

    const existingVariantIds = existingVariants.map(v => v.id);
    const existingValues = new Map<string, Set<string>>();
    if (existingVariantIds.length > 0) {
      const vavResult = await db.run(
        dbSql`SELECT entity_id, option_id FROM ${product_attribute_values} WHERE ${product_attribute_values.entity_type} = 'variant' AND ${product_attribute_values.entity_id} IN (${dbSql.join(existingVariantIds.map(vid => dbSql`${vid}`))})`
      );
      const rows = vavResult.rows as any[];
      for (const row of rows) {
        if (!existingValues.has(row.entity_id)) {
          existingValues.set(row.entity_id, new Set());
        }
        existingValues.get(row.entity_id)!.add(row.option_id);
      }
    }

    // Process each combination
    const createdVariants: any[] = [];

    for (const combo of combinations) {
      const comboSet = new Set(combo.option_ids);

      // Check for duplicate
      for (const [vId, optSet] of existingValues) {
        if (optSet.size === comboSet.size && [...optSet].every(id => comboSet.has(id))) {
          return new Response(
            JSON.stringify({ success: false, error: 'Duplicate variant combination' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      // Create variant
      const variantId = crypto.randomUUID();
      await db.insert(product_variants).values({
        id: variantId,
        product_id: productId,
        sku: combo.sku || null,
        stock: combo.stock ?? null,
        active: combo.active !== undefined ? combo.active : true,
      });

      // Create attribute value rows for each dimension option
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

      // Track this variant to prevent duplicates within the same request
      existingValues.set(variantId, comboSet);

      createdVariants.push({
        id: variantId,
        sku: combo.sku,
        stock: combo.stock,
        active: combo.active !== undefined ? combo.active : true,
        option_ids: combo.option_ids,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: createdVariants,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
