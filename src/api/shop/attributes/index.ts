import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, product_attributes, product_attribute_options, translations, sql as dbSql } from 'astro:db';
import { CreateAttributeSchema } from '../../../schemas/product.schema';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    // Fetch all attributes ordered by sort_order
    const allAttributes = await db
      .select()
      .from(product_attributes)
      .orderBy(product_attributes.sort_order);

    // Fetch translations for the requested locale
    const attributeIds = allAttributes.map(a => a.id);
    let translationRows: any[] = [];
    if (attributeIds.length > 0) {
      translationRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(attributeIds.map(id => dbSql`${id}`))})`
        );
    }

    // Map translations by entity_id
    const transMap = new Map(translationRows.map(t => [t.entity_id, t]));

    // Fetch option counts for select-type attributes
    const selectAttributes = allAttributes.filter(a => a.type === 'select');
    const optionCounts = new Map<string, number>();
    if (selectAttributes.length > 0) {
      const optionRows = await db
        .select()
        .from(product_attribute_options)
        .where(
          dbSql`${product_attribute_options.attribute_id} IN (${dbSql.join(selectAttributes.map(a => dbSql`${a.id}`))})`
        );
      for (const row of optionRows) {
        const count = optionCounts.get(row.attribute_id) || 0;
        optionCounts.set(row.attribute_id, count + 1);
      }
    }

    // Enrich attributes
    const enriched = allAttributes.map(a => {
      const t = transMap.get(a.id);
      return {
        id: a.id,
        name: t?.name ?? a.name,
        type: a.type,
        sort_order: a.sort_order,
        option_count: a.type === 'select' ? (optionCounts.get(a.id) || 0) : null,
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

    const body = await context.request.json();
    const result = CreateAttributeSchema.safeParse(body);

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

    const id = crypto.randomUUID();
    const { name, type, sort_order } = result.data;

    await db.insert(product_attributes).values({
      id,
      name,
      type,
      sort_order,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: { id, name, type, sort_order },
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
