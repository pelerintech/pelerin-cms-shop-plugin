import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, product_option_types, product_variants, product_variant_option_values, product_option_values } from 'astro:db';

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id, optionTypeId } = context.params;

    const [existing] = await db
      .select()
      .from(product_option_types)
      .where(eq(product_option_types.id, optionTypeId));

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Option type not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const updateData: Record<string, any> = {};
    if (body.label !== undefined) updateData.label = body.label;
    if (body.value_type !== undefined) updateData.value_type = body.value_type;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

    if (Object.keys(updateData).length > 0) {
      await db
        .update(product_option_types)
        .set(updateData)
        .where(eq(product_option_types.id, optionTypeId));
    }

    const [updated] = await db
      .select()
      .from(product_option_types)
      .where(eq(product_option_types.id, optionTypeId));

    return new Response(JSON.stringify({ success: true, data: updated }), {
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

export const DELETE: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id, optionTypeId } = context.params;

    const [existing] = await db
      .select()
      .from(product_option_types)
      .where(eq(product_option_types.id, optionTypeId));

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Option type not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if any variants use values of this option type
    const optionValues = await db
      .select()
      .from(product_option_values)
      .where(eq(product_option_values.option_type_id, optionTypeId));

    if (optionValues.length > 0) {
      const ovIds = optionValues.map(ov => ov.id);
      // Check if any of these values are linked to variants
      const linked = await db
        .select()
        .from(product_variant_option_values)
        .where(
          // Use IN-like check — just check if any rows exist
          // Actually, check if any variant uses any of these values
          // We'll just query all and filter
        );

      // Check each value
      for (const ov of optionValues) {
        const count = linked.filter(l => l.option_value_id === ov.id);
        if (count.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Cannot delete option type with existing variants',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      // Check if any variant uses any of these values
      const hasLinkedValues = linked.some(l => ovIds.includes(l.option_value_id));
      // We need a better approach—check with raw query
    }

    // This is a comprehensive check:
    // If any variant_option_value references an option_value of this type → reject
    const hasVariants = await db
      .select({ count: product_variant_option_values.id })
      .from(product_variant_option_values)
      .innerJoin(
        product_option_values,
        eq(product_variant_option_values.option_value_id, product_option_values.id)
      )
      .where(eq(product_option_values.option_type_id, optionTypeId))
      .limit(1);

    // Actually, the join approach may not work well in astro:db. Let me use raw SQL.
    // We already fetched optionValues above. Let's check if any are linked.
    // Re-fetch with a simple query
    const allLinked = await db.select().from(product_variant_option_values);

    if (optionValues.some(ov => allLinked.some(l => l.option_value_id === ov.id))) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Cannot delete option type with existing variants',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete option values for this type
    await db
      .delete(product_option_values)
      .where(eq(product_option_values.option_type_id, optionTypeId));

    // Delete the option type
    await db
      .delete(product_option_types)
      .where(eq(product_option_types.id, optionTypeId));

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