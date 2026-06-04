import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, products, product_attributes, product_attribute_assignments, product_attribute_options, translations, sql as dbSql } from 'astro:db';
import { CreateAttributeAssignmentSchema } from '../../../../../schemas/product.schema';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const productId = context.params.id!;
    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    // Verify product exists
    const prodResult = await db
      .select()
      .from(products)
      .where(dbSql`${products.id} = ${productId}`);

    if (prodResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch assignments for this product
    const assignments = await db
      .select()
      .from(product_attribute_assignments)
      .where(dbSql`${product_attribute_assignments.product_id} = ${productId}`)
      .orderBy(product_attribute_assignments.sort_order);

    // Fetch attribute details
    const attributeIds = assignments.map(a => a.attribute_id);
    const attributesMap = new Map();
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
    }

    // Fetch translations for attribute names
    let transRows: any[] = [];
    if (attributeIds.length > 0) {
      transRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(attributeIds.map(id => dbSql`${id}`))})`
        );
    }
    const transMap = new Map(transRows.map(t => [t.entity_id, t]));

    // Fetch offered options for dimension assignments
    const dimensionAssignments = assignments.filter(a => a.role === 'dimension');
    const optionsMap = new Map<string, any[]>();
    if (dimensionAssignments.length > 0) {
      for (const assignment of dimensionAssignments) {
        try {
          const offeredIds = JSON.parse(assignment.offered_option_ids || '[]');
          if (offeredIds.length > 0) {
            const options = await db
              .select()
              .from(product_attribute_options)
              .where(
                dbSql`${product_attribute_options.id} IN (${dbSql.join(offeredIds.map(id => dbSql`${id}`))})`
              )
              .orderBy(product_attribute_options.sort_order);

            // Fetch translations for option labels
            const optionIds = options.map(o => o.id);
            let optTransRows: any[] = [];
            if (optionIds.length > 0) {
              optTransRows = await db
                .select()
                .from(translations)
                .where(
                  dbSql`${translations.entity_type} = 'product_attribute_option' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(optionIds.map(id => dbSql`${id}`))})`
                );
            }
            const optTransMap = new Map(optTransRows.map(t => [t.entity_id, t]));

            const enrichedOptions = options.map(o => ({
              id: o.id,
              value: o.value,
              label: optTransMap.get(o.id)?.label ?? o.value,
              sort_order: o.sort_order,
            }));
            optionsMap.set(assignment.id, enrichedOptions);
          } else {
            optionsMap.set(assignment.id, []);
          }
        } catch {
          optionsMap.set(assignment.id, []);
        }
      }
    }

    // Build response
    const enriched = assignments.map(a => {
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
        offered_options: a.role === 'dimension' ? (optionsMap.get(a.id) || []) : null,
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

export const POST: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const productId = context.params.id!;
    const body = await context.request.json();
    const result = CreateAttributeAssignmentSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(
            result.error.issues.map(i => [i.path.join('.'), i.message])
          ),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify product exists
    const prodResult = await db
      .select()
      .from(products)
      .where(dbSql`${products.id} = ${productId}`);

    if (prodResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify attribute exists
    const attrResult = await db
      .select()
      .from(product_attributes)
      .where(dbSql`${product_attributes.id} = ${result.data.attribute_id}`);

    if (attrResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Attribute not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for duplicate assignment
    const existing = await db
      .select()
      .from(product_attribute_assignments)
      .where(
        dbSql`${product_attribute_assignments.product_id} = ${productId} AND ${product_attribute_assignments.attribute_id} = ${result.data.attribute_id}`
      );

    if (existing.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Attribute is already assigned to this product' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // For dimension role, validate offered_option_ids
    if (result.data.role === 'dimension') {
      if (!result.data.offered_option_ids || result.data.offered_option_ids.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Dimension attributes require at least one offered option',
            fields: { offered_option_ids: 'At least one option is required for dimension attributes' },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Verify all offered option IDs belong to this attribute
      const attr = attrResult[0];
      if (attr.type === 'select') {
        const globalOptions = await db
          .select()
          .from(product_attribute_options)
          .where(dbSql`${product_attribute_options.attribute_id} = ${attr.id}`);
        const globalOptionIds = globalOptions.map(o => o.id);

        const invalidOptions = result.data.offered_option_ids.filter(
          id => !globalOptionIds.includes(id)
        );

        if (invalidOptions.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Some offered options do not belong to this attribute',
              fields: { offered_option_ids: `Invalid option IDs: ${invalidOptions.join(', ')}` },
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Only select-type attributes can be used as dimensions',
            fields: { role: 'Dimension role requires a select-type attribute' },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const id = crypto.randomUUID();
    const { attribute_id, role, sort_order, offered_option_ids } = result.data;

    await db.insert(product_attribute_assignments).values({
      id,
      product_id: productId,
      attribute_id,
      role,
      sort_order,
      offered_option_ids: JSON.stringify(offered_option_ids || []),
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id,
          product_id: productId,
          attribute_id,
          role,
          sort_order,
          offered_option_ids: offered_option_ids || [],
        },
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
