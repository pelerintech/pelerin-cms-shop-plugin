import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, product_variants, product_attribute_values, product_attribute_assignments, product_prices, sql as dbSql } from 'astro:db';
import { UpdateVariantSchema } from '../../../../../schemas/product.schema';

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { variantId } = context.params;

    const [existing] = await db
      .select()
      .from(product_variants)
      .where(dbSql`${product_variants.id} = ${variantId}`);

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Variant not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();

    // Update variant fields (sku, stock, active)
    const variantResult = UpdateVariantSchema.safeParse(body);
    if (variantResult.success) {
      const updateData: Record<string, any> = {};
      if (body.sku !== undefined) updateData.sku = body.sku;
      if (body.stock !== undefined) updateData.stock = body.stock;
      if (body.active !== undefined) updateData.active = body.active;

      if (Object.keys(updateData).length > 0) {
        await db
          .update(product_variants)
          .set(updateData)
          .where(dbSql`${product_variants.id} = ${variantId}`);
      }
    }

    // Update field values if provided
    if (body.field_values && Array.isArray(body.field_values)) {
      for (const fv of body.field_values) {
        const { assignment_id, option_id, value_text, value_number, value_boolean } = fv;

        // Validate assignment belongs to this product and is field role
        const [assignment] = await db
          .select()
          .from(product_attribute_assignments)
          .where(
            dbSql`${product_attribute_assignments.id} = ${assignment_id} AND ${product_attribute_assignments.product_id} = ${existing.product_id} AND ${product_attribute_assignments.role} = 'field'`
          );

        if (!assignment) {
          continue; // Skip invalid assignments
        }

        // Upsert: check if value already exists
        const [existingValue] = await db
          .select()
          .from(product_attribute_values)
          .where(
            dbSql`${product_attribute_values.entity_type} = 'variant' AND ${product_attribute_values.entity_id} = ${variantId} AND ${product_attribute_values.assignment_id} = ${assignment_id}`
          );

        if (existingValue) {
          // Update existing
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
          // Insert new
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
    }

    const [updated] = await db
      .select()
      .from(product_variants)
      .where(dbSql`${product_variants.id} = ${variantId}`);

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
    const { variantId } = context.params;

    const [existing] = await db
      .select()
      .from(product_variants)
      .where(dbSql`${product_variants.id} = ${variantId}`);

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Variant not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete variant-level attribute values
    await db.run(
      dbSql`DELETE FROM ${product_attribute_values} WHERE ${product_attribute_values.entity_type} = 'variant' AND ${product_attribute_values.entity_id} = ${variantId}`
    );

    // Delete variant prices
    await db.run(
      dbSql`DELETE FROM ${product_prices} WHERE ${product_prices.variant_id} = ${variantId}`
    );

    // Delete the variant
    await db.run(
      dbSql`DELETE FROM ${product_variants} WHERE ${product_variants.id} = ${variantId}`
    );

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
