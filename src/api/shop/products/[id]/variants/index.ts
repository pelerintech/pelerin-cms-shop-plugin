import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  db, eq,
  product_variants, product_variant_option_values, product_prices,
  product_option_values, product_option_types,
  sql as dbSql,
} from 'astro:db';
import { CreateVariantSchema } from '../../../../../../schemas/product.schema.ts';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const variants = await db
      .select()
      .from(product_variants)
      .where(eq(product_variants.product_id, id));

    // Fetch variant option values
    let variantOptionValues: any[] = [];
    let variantPrices: any[] = [];
    let optionValues: any[] = [];
    let optionTypes: any[] = [];

    if (variants.length > 0) {
      const variantIds = variants.map(v => v.id);

      const vovResult = await db.run(
        dbSql`SELECT * FROM ${product_variant_option_values} WHERE ${product_variant_option_values.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantOptionValues = vovResult.rows as any[];

      const vpResult = await db.run(
        dbSql`SELECT * FROM ${product_prices} WHERE ${product_prices.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantPrices = vpResult.rows as any[];

      const ovIds = Array.from(new Set(variantOptionValues.map(v => v.option_value_id)));
      if (ovIds.length > 0) {
        const ovResult = await db.run(
          dbSql`SELECT * FROM ${product_option_values} WHERE ${product_option_values.id} IN (${dbSql.join(ovIds.map(oid => dbSql`${oid}`))})`
        );
        optionValues = ovResult.rows as any[];

        const otIds = Array.from(new Set(optionValues.map(ov => ov.option_type_id)));
        if (otIds.length > 0) {
          const otResult = await db.run(
            dbSql`SELECT * FROM ${product_option_types} WHERE ${product_option_types.id} IN (${dbSql.join(otIds.map(oid => dbSql`${oid}`))})`
          );
          optionTypes = otResult.rows as any[];
        }
      }
    }

    const enriched = variants.map(v => {
      const vov = variantOptionValues.filter(vo => vo.variant_id === v.id);
      const vp = variantPrices.filter(p => p.variant_id === v.id);
      return {
        ...v,
        option_values: vov.map(vo => {
          const ov = optionValues.find(o => o.id === vo.option_value_id);
          if (!ov) return null;
          const ot = optionTypes.find(t => t.id === ov.option_type_id);
          return {
            id: ov.id,
            option_type_id: ov.option_type_id,
            option_type: ot?.label || '',
            value: ov.value,
            label: ov.label,
          };
        }).filter(Boolean),
        prices: vp.map(p => ({ currency: p.currency, price_net: p.price_net })),
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
    const { id } = context.params;

    const body = await context.request.json();
    const result = CreateVariantSchema.safeParse({ ...body, product_id: id });

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

    const optionValueIds = result.data.option_value_ids || [];

    // Check for duplicate combination
    if (optionValueIds.length > 0) {
      const allVariants = await db
        .select()
        .from(product_variants)
        .where(eq(product_variants.product_id, id));

      const variantIds = allVariants.map(v => v.id);
      if (variantIds.length > 0) {
        const existingVovs = await db.run(
          dbSql`SELECT * FROM ${product_variant_option_values} WHERE ${product_variant_option_values.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
        );
        const existingRows = existingVovs.rows as any[];

        // Group by variant_id
        const byVariant = new Map<string, Set<string>>();
        for (const row of existingRows) {
          if (!byVariant.has(row.variant_id)) byVariant.set(row.variant_id, new Set());
          byVariant.get(row.variant_id)!.add(row.option_value_id);
        }

        // Check if any variant has exactly the same option value IDs
        const newSet = new Set(optionValueIds);
        for (const [vId, set] of byVariant) {
          if (set.size === newSet.size && [...set].every(id => newSet.has(id))) {
            return new Response(
              JSON.stringify({ success: false, error: 'Duplicate variant combination' }),
              { status: 409, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    }

    const variantId = crypto.randomUUID();

    await db.insert(product_variants).values({
      id: variantId,
      product_id: id,
      sku: result.data.sku,
      stock: result.data.stock,
      active: result.data.active,
    });

    // Link option values
    for (const ovId of optionValueIds) {
      await db.insert(product_variant_option_values).values({
        id: crypto.randomUUID(),
        variant_id: variantId,
        option_value_id: ovId,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { id: variantId, ...result.data },
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