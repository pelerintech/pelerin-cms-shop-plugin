import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, product_attribute_options, product_attribute_assignments, translations, sql as dbSql } from 'astro:db';
import { UpdateAttributeOptionSchema } from '../../../../../schemas/product.schema';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const optionId = context.params.optionId!;
    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    const result = await db
      .select()
      .from(product_attribute_options)
      .where(dbSql`${product_attribute_options.id} = ${optionId}`);

    if (result.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Option not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const opt = result[0];

    // Resolve label from translations
    let label = opt.value;
    if (locale !== 'ro') {
      const transResult = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute_option' AND ${translations.entity_id} = ${optionId} AND ${translations.locale} = ${locale}`
        );
      const translated = transResult.find(t => t.label);
      if (translated) label = translated.label;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: opt.id,
          attribute_id: opt.attribute_id,
          value: opt.value,
          label,
          sort_order: opt.sort_order,
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

    const optionId = context.params.optionId!;
    const body = await context.request.json();
    const result = UpdateAttributeOptionSchema.safeParse(body);

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

    // Check option exists
    const existing = await db
      .select()
      .from(product_attribute_options)
      .where(dbSql`${product_attribute_options.id} = ${optionId}`);

    if (existing.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Option not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { value, sort_order } = result.data;

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let valIdx = 1;

    if (value !== undefined) {
      updates.push(`value = $${valIdx++}`);
      values.push(value);
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

    values.push(optionId);
    const query = `UPDATE product_attribute_options SET ${updates.join(', ')} WHERE id = ?`;
    await db.run(dbSql`${dbSql.raw(query)}`, ...values);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: optionId,
          value: value ?? existing[0].value,
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

    const optionId = context.params.optionId!;

    // Check if any assignment uses this option in offered_option_ids
    const assignments = await db.select().from(product_attribute_assignments);
    const hasUsage = assignments.some(a => {
      try {
        const offered = JSON.parse(a.offered_option_ids || '[]');
        return offered.includes(optionId);
      } catch {
        return false;
      }
    });

    if (hasUsage) {
      return new Response(
        JSON.stringify({ success: false, error: 'Option is used in product assignments. Remove from products first.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete option
    const result = await db.run(
      dbSql`DELETE FROM ${product_attribute_options} WHERE ${product_attribute_options.id} = ${optionId}`
    );

    if (!result.changes || result.changes === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Option not found' }),
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
