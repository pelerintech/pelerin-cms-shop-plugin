import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, product_option_values } from 'astro:db';
import { CreateOptionValueSchema } from '../../../../../../../schemas/product.schema'

export const POST: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { optionTypeId } = context.params;

    const body = await context.request.json();
    const result = CreateOptionValueSchema.safeParse({ ...body, option_type_id: optionTypeId });

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

    const valueId = crypto.randomUUID();

    await db.insert(product_option_values).values({
      id: valueId,
      option_type_id: optionTypeId,
      value: result.data.value,
      label: result.data.label,
      sort_order: result.data.sort_order,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: { id: valueId, ...result.data },
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