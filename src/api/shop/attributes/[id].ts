import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, product_attributes, product_attribute_options, product_attribute_assignments, translations, sql as dbSql } from 'astro:db';
import { UpdateAttributeSchema } from '../../../schemas/product.schema';

/**
 * Resolve attribute name for a given locale, falling back to default locale name.
 */
async function resolveAttributeName(attributeId: string, locale: string): Promise<string> {
  if (locale === 'ro') {
    // Default locale — use the name column directly
    const result = await db.select().from(product_attributes).where(dbSql`${product_attributes.id} = ${attributeId}`);
    return result[0]?.name ?? '';
  }
  const result = await db
    .select()
    .from(translations)
    .where(
      dbSql`${translations.entity_type} = 'product_attribute' AND ${translations.entity_id} = ${attributeId} AND ${translations.locale} = ${locale}`
    );
  const translated = result.find(t => t.name);
  return translated?.name ?? '';
}

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const id = context.params.id!;
    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    const result = await db
      .select()
      .from(product_attributes)
      .where(dbSql`${product_attributes.id} = ${id}`);

    if (result.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Attribute not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const attr = result[0];
    const name = await resolveAttributeName(id, locale);

    // Fetch option count for select types
    let option_count: number | null = null;
    if (attr.type === 'select') {
      const options = await db
        .select()
        .from(product_attribute_options)
        .where(dbSql`${product_attribute_options.attribute_id} = ${id}`);
      option_count = options.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: attr.id,
          name,
          type: attr.type,
          sort_order: attr.sort_order,
          option_count,
        },
      }),
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

    const id = context.params.id!;
    const body = await context.request.json();
    const result = UpdateAttributeSchema.safeParse(body);

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

    // Check attribute exists
    const existing = await db
      .select()
      .from(product_attributes)
      .where(dbSql`${product_attributes.id} = ${id}`);

    if (existing.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Attribute not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { name, type, sort_order } = result.data;

    // Reject type change if attribute has assignments or options
    if (type !== undefined && type !== existing[0].type) {
      const assignments = await db
        .select()
        .from(product_attribute_assignments)
        .where(dbSql`${product_attribute_assignments.attribute_id} = ${id}`);
      const options = await db
        .select()
        .from(product_attribute_options)
        .where(dbSql`${product_attribute_options.attribute_id} = ${id}`);

      if (assignments.length > 0 || options.length > 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Cannot change type of attribute that has assignments or options' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let valIdx = 1;

    if (name !== undefined) {
      updates.push(`name = $${valIdx++}`);
      values.push(name);
    }
    if (type !== undefined) {
      updates.push(`type = $${valIdx++}`);
      values.push(type);
    }
    if (sort_order !== undefined) {
      updates.push(`sort_order = $${valIdx++}`);
      values.push(sort_order);
    }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: existing[0] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    values.push(id);
    const query = `UPDATE product_attributes SET ${updates.join(', ')} WHERE id = ?`;
    await db.run(dbSql`${dbSql.raw(query)}`, ...values);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id,
          name: name ?? existing[0].name,
          type: type ?? existing[0].type,
          sort_order: sort_order ?? existing[0].sort_order,
        },
      }),
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

export const DELETE: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const id = context.params.id!;

    // Check if attribute has assignments
    const assignments = await db
      .select()
      .from(product_attribute_assignments)
      .where(dbSql`${product_attribute_assignments.attribute_id} = ${id}`);

    if (assignments.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Attribute is assigned to products. Remove assignments first.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete options first (FK)
    await db.run(
      dbSql`DELETE FROM ${product_attribute_options} WHERE ${product_attribute_options.attribute_id} = ${id}`
    );

    // Delete attribute
    const result = await db.run(
      dbSql`DELETE FROM ${product_attributes} WHERE ${product_attributes.id} = ${id}`
    );

    if (!result.changes || result.changes === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Attribute not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
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
