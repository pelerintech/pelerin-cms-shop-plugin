import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  db, eq, and,
  products, translations, product_prices, product_images,
  product_variants, product_variant_option_values, product_option_values,
  product_option_types,
  sql as dbSql,
} from 'astro:db';
import { UpdateProductSchema } from '../../../../schemas/product.schema.ts';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (!product) {
      return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch translations
    const transRows = await db
      .select()
      .from(translations)
      .where(
        and(eq(translations.entity_type, 'product'), eq(translations.entity_id, id))
      );

    // Fetch prices
    const priceRows = await db
      .select()
      .from(product_prices)
      .where(eq(product_prices.product_id, id));

    // Fetch images
    const imageRows = await db
      .select()
      .from(product_images)
      .where(eq(product_images.product_id, id))
      .orderBy(product_images.sort_order);

    // Fetch variants with option values
    const variantRows = await db
      .select()
      .from(product_variants)
      .where(eq(product_variants.product_id, id));

    // Fetch variant option values
    let variantOptionValues: any[] = [];
    let variantPrices: any[] = [];
    if (variantRows.length > 0) {
      const variantIds = variantRows.map(v => v.id);
      const vovResult = await db.run(
        dbSql`SELECT * FROM ${product_variant_option_values} WHERE ${product_variant_option_values.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantOptionValues = vovResult.rows as any[];

      const vpResult = await db.run(
        dbSql`SELECT * FROM ${product_prices} WHERE ${product_prices.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantPrices = vpResult.rows as any[];
    }

    // Fetch option types and values for this product
    const optionTypeRows = await db
      .select()
      .from(product_option_types)
      .where(eq(product_option_types.product_id, id))
      .orderBy(product_option_types.sort_order);

    let optionValues: any[] = [];
    if (optionTypeRows.length > 0) {
      const otIds = optionTypeRows.map(ot => ot.id);
      const ovResult = await db.run(
        dbSql`SELECT * FROM ${product_option_values} WHERE ${product_option_values.option_type_id} IN (${dbSql.join(otIds.map(oid => dbSql`${oid}`))})`
      );
      optionValues = ovResult.rows as any[];
    }

    // Enrich variants with option values and prices
    const enrichedVariants = variantRows.map(v => {
      const vov = variantOptionValues.filter(vo => vo.variant_id === v.id);
      const vp = variantPrices.filter(p => p.variant_id === v.id);
      return {
        ...v,
        option_values: vov.map(vo => {
          const ov = optionValues.find(o => o.id === vo.option_value_id);
          return ov ? { id: ov.id, value: ov.value, label: ov.label } : null;
        }).filter(Boolean),
        prices: vp.map(p => ({ currency: p.currency, price_net: p.price_net })),
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...product,
          translations: transRows,
          prices: priceRows.map(p => ({ currency: p.currency, price_net: p.price_net })),
          images: imageRows,
          variants: enrichedVariants,
          options: optionTypeRows.map(ot => ({
            ...ot,
            values: optionValues.filter(ov => ov.option_type_id === ot.id),
          })),
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
    const { id } = context.params;

    const [existing] = await db.select().from(products).where(eq(products.id, id));
    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const result = UpdateProductSchema.safeParse(body);

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

    const updateData: Record<string, any> = {};
    if (result.data.type !== undefined) updateData.type = result.data.type;
    if (result.data.sku !== undefined) updateData.sku = result.data.sku;
    if (result.data.has_variants !== undefined) updateData.has_variants = result.data.has_variants;
    if (result.data.vat_rate !== undefined) updateData.vat_rate = result.data.vat_rate;
    if (result.data.stock !== undefined) updateData.stock = result.data.stock;
    if (result.data.category_id !== undefined) updateData.category_id = result.data.category_id;
    if (result.data.active !== undefined) updateData.active = result.data.active;
    if (result.data.name !== undefined) updateData.name = result.data.name;
    if (result.data.description !== undefined) updateData.description = result.data.description;
    if (result.data.slug !== undefined) updateData.slug = result.data.slug;

    if (Object.keys(updateData).length > 0) {
      await db.update(products).set(updateData).where(eq(products.id, id));
    }

    const [updated] = await db.select().from(products).where(eq(products.id, id));

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
    const { id } = context.params;

    const [existing] = await db.select().from(products).where(eq(products.id, id));
    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Soft delete: set active = false
    await db.update(products).set({ active: false }).where(eq(products.id, id));

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