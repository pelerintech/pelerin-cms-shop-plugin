import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, product_attributes, product_attribute_options, product_attribute_assignments, translations, sql as dbSql } from 'astro:db';
import { CreateAttributeOptionSchema } from '../../../../schemas/product.schema';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const attributeId = context.params.id!;
    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    // Verify attribute exists
    const attrResult = await db
      .select()
      .from(product_attributes)
      .where(dbSql`${product_attributes.id} = ${attributeId}`);

    if (attrResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Attribute not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all options for this attribute
    const options = await db
      .select()
      .from(product_attribute_options)
      .where(dbSql`${product_attribute_options.attribute_id} = ${attributeId}`)
      .orderBy(product_attribute_options.sort_order);

    // Fetch translations for the requested locale
    const optionIds = options.map(o => o.id);
    let translationRows: any[] = [];
    if (optionIds.length > 0) {
      translationRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute_option' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(optionIds.map(id => dbSql`${id}`))})`
        );
    }

    const transMap = new Map(translationRows.map(t => [t.entity_id, t]));

    const enriched = options.map(o => ({
      id: o.id,
      attribute_id: o.attribute_id,
      value: o.value,
      label: transMap.get(o.id)?.label ?? o.value,
      sort_order: o.sort_order,
    }));

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

    const attributeId = context.params.id!;
    const body = await context.request.json();
    const result = CreateAttributeOptionSchema.safeParse({ ...body, attribute_id: attributeId });

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

    // Verify attribute exists and is select type
    const attrResult = await db
      .select()
      .from(product_attributes)
      .where(dbSql`${product_attributes.id} = ${attributeId}`);

    if (attrResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Attribute not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (attrResult[0].type !== 'select') {
      return new Response(
        JSON.stringify({ success: false, error: 'Options can only be added to select-type attributes' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const id = crypto.randomUUID();
    const { value, sort_order } = result.data;

    await db.insert(product_attribute_options).values({
      id,
      attribute_id: attributeId,
      value,
      sort_order,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: { id, attribute_id: attributeId, value, sort_order },
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
