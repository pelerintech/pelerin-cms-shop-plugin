import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, product_option_values, product_variant_option_values } from 'astro:db';

export const DELETE: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { valueId } = context.params;

    const [existing] = await db
      .select()
      .from(product_option_values)
      .where(eq(product_option_values.id, valueId));

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Option value not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if value is used by any variant
    const linked = await db
      .select()
      .from(product_variant_option_values)
      .where(eq(product_variant_option_values.option_value_id, valueId));

    if (linked.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Cannot delete option value used by existing variants',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await db
      .delete(product_option_values)
      .where(eq(product_option_values.id, valueId));

    return new Response(JSON.stringify({ success: true, data: null }), {
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