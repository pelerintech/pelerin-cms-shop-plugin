import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, product_variants, product_attribute_values, product_attribute_assignments, product_attributes, translations, sql as dbSql } from 'astro:db';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const variantId = context.params.variantId!;
    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    // Verify variant exists
    const [variant] = await db
      .select()
      .from(product_variants)
      .where(dbSql`${product_variants.id} = ${variantId}`);

    if (!variant) {
      return new Response(
        JSON.stringify({ success: false, error: 'Variant not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch field-role assignments for the product
    const assignments = await db
      .select()
      .from(product_attribute_assignments)
      .where(
        dbSql`${product_attribute_assignments.product_id} = ${variant.product_id} AND ${product_attribute_assignments.role} = 'field'`
      )
      .orderBy(product_attribute_assignments.sort_order);

    // Fetch variant-level attribute values
    const assignmentIds = assignments.map(a => a.id);
    let values: any[] = [];
    if (assignmentIds.length > 0) {
      const valResult = await db.run(
        dbSql`SELECT * FROM ${product_attribute_values} WHERE ${product_attribute_values.entity_type} = 'variant' AND ${product_attribute_values.entity_id} = ${variantId} AND ${product_attribute_values.assignment_id} IN (${dbSql.join(assignmentIds.map(id => dbSql`${id}`))})`
      );
      values = valResult.rows as any[];
    }

    // Build maps for enrichment
    const assignmentsMap = new Map(assignments.map(a => [a.id, a]));
    const attributesMap = new Map<string, any>();
    const attrTransMap = new Map<string, string>();

    const attributeIds = Array.from(new Set(assignments.map(a => a.attribute_id)));
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
    const optionIds = Array.from(new Set(values.filter(v => v.option_id).map(v => v.option_id)));
    const optionLabelsMap = new Map<string, string>();
    if (optionIds.length > 0) {
      const optTransRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute_option' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(optionIds.map(id => dbSql`${id}`))})`
        );
      for (const t of optTransRows) {
        if (t.label) optionLabelsMap.set(t.entity_id, t.label);
      }
    }

    const enriched = assignments.map(a => {
      const attr = attributesMap.get(a.attribute_id);
      const val = values.find(v => v.assignment_id === a.id);

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

    return new Response(
      JSON.stringify({ success: true, data: enriched }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const variantId = context.params.variantId!;

    // Verify variant exists
    const [variant] = await db
      .select()
      .from(product_variants)
      .where(dbSql`${product_variants.id} = ${variantId}`);

    if (!variant) {
      return new Response(
        JSON.stringify({ success: false, error: 'Variant not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await context.request.json();

    if (!body.values || !Array.isArray(body.values)) {
      return new Response(
        JSON.stringify({ success: false, error: 'values array is required' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    for (const val of body.values) {
      const { assignment_id, option_id, value_text, value_number, value_boolean } = val;

      // Validate assignment belongs to the variant's product and is field role
      const [assignment] = await db
        .select()
        .from(product_attribute_assignments)
        .where(
          dbSql`${product_attribute_assignments.id} = ${assignment_id} AND ${product_attribute_assignments.product_id} = ${variant.product_id} AND ${product_attribute_assignments.role} = 'field'`
        );

      if (!assignment) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Assignment ${assignment_id} does not belong to this variant's product or is not a field role`,
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Upsert: check if value already exists
      const [existingValue] = await db
        .select()
        .from(product_attribute_values)
        .where(
          dbSql`${product_attribute_values.entity_type} = 'variant' AND ${product_attribute_values.entity_id} = ${variantId} AND ${product_attribute_values.assignment_id} = ${assignment_id}`
        );

      if (existingValue) {
        await db
          .update(product_attribute_values)
          .set({
            option_id: option_id ?? null,
            value_text: value_text ?? null,
            value_number: value_number ?? null,
            value_boolean: value_boolean ?? null,
          })
          .where(dbSql`${product_attribute_values.id} = ${existingValue.id}`);
      } else {
        await db.insert(product_attribute_values).values({
          id: crypto.randomUUID(),
          entity_type: 'variant',
          entity_id: variantId,
          assignment_id,
          option_id: option_id ?? null,
          value_text: value_text ?? null,
          value_number: value_number ?? null,
          value_boolean: value_boolean ?? null,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
