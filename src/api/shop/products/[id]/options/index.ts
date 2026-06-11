import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, product_option_types, product_option_values, sql as dbSql } from 'astro:db';
import { CreateOptionTypeSchema } from '../../../../../schemas/product.schema'

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const optionTypes = await db
      .select()
      .from(product_option_types)
      .where(eq(product_option_types.product_id, id))
      .orderBy(product_option_types.sort_order);

    // Fetch values for all option types
    let values: any[] = [];
    if (optionTypes.length > 0) {
      const otIds = optionTypes.map(ot => ot.id);
      const result = await db.run(
        dbSql`SELECT * FROM ${product_option_values} WHERE ${product_option_values.option_type_id} IN (${dbSql.join(otIds.map(oid => dbSql`${oid}`))}) ORDER BY ${product_option_values.sort_order}`
      );
      values = result.rows as any[];
    }

    const withValues = optionTypes.map(ot => ({
      ...ot,
      values: values.filter(v => v.option_type_id === ot.id),
    }));

    return new Response(JSON.stringify({ success: true, data: withValues }), {
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
    const { id } = context.params;

    const body = await context.request.json();
    const result = CreateOptionTypeSchema.safeParse({ ...body, product_id: id });

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

    const optionId = crypto.randomUUID();

    await db.insert(product_option_types).values({
      id: optionId,
      product_id: id,
      label: result.data.label,
      value_type: result.data.value_type,
      sort_order: result.data.sort_order,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: { id: optionId, ...result.data },
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