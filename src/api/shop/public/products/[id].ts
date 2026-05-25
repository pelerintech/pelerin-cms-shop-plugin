import type { APIRoute } from 'astro';
import {
  db, eq, and,
  products, translations, product_prices, product_images,
  product_variants, product_variant_option_values, product_option_values,
  product_option_types,
  sql as dbSql,
} from 'astro:db';

function computeGross(priceNet: number, vatRate: number | null): {
  price_net: number;
  price_gross: number;
  vat_amount: number;
} {
  const effectiveVatRate = vatRate ?? 0;
  const gross = Math.round(priceNet * (1 + effectiveVatRate) * 100) / 100;
  return {
    price_net: priceNet,
    price_gross: gross,
    vat_amount: Math.round((gross - priceNet) * 100) / 100,
  };
}

export const GET: APIRoute = async (context) => {
  try {
    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';
    const currency = url.searchParams.get('currency') || 'RON';

    const { id } = context.params;

    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.active, 1)));

    if (!product) {
      return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Try requested locale, fall back to default
    let [trans] = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entity_type, 'product'),
          eq(translations.entity_id, id),
          eq(translations.locale, locale)
        )
      );

    let usedLocale = locale;
    if (!trans) {
      usedLocale = 'ro';
      [trans] = await db
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product'),
            eq(translations.entity_id, id),
            eq(translations.locale, 'ro')
          )
        );
    }

    // Fetch prices for the requested currency
    const priceRows = await db.run(
      dbSql`SELECT * FROM ${product_prices} WHERE (${product_prices.product_id} = ${id} OR ${product_prices.variant_id} IN (SELECT id FROM product_variants WHERE product_id = ${id})) AND ${product_prices.currency} = ${currency}`
    );
    const allPrices = priceRows.rows as any[];

    const vatRate = product.vat_rate;

    // Build prices map
    const pricesByCurrency: Record<string, any> = {};
    for (const p of allPrices) {
      if (!pricesByCurrency[p.currency]) {
        pricesByCurrency[p.currency] = computeGross(p.price_net, vatRate);
      }
    }

    // Fetch images
    const imageRows = await db
      .select()
      .from(product_images)
      .where(eq(product_images.product_id, id))
      .orderBy(product_images.sort_order);

    // Fetch variants
    const variantRows = await db
      .select()
      .from(product_variants)
      .where(and(eq(product_variants.product_id, id), eq(product_variants.active, 1)));

    let variantOptionValues: any[] = [];
    let variantPrices: any[] = [];
    let optionValues: any[] = [];
    let optionTypes: any[] = [];

    if (variantRows.length > 0) {
      const variantIds = variantRows.map(v => v.id);

      const vovResult = await db.run(
        dbSql`SELECT * FROM ${product_variant_option_values} WHERE ${product_variant_option_values.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantOptionValues = vovResult.rows as any[];

      const vpResult = await db.run(
        dbSql`SELECT * FROM ${product_prices} WHERE ${product_prices.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))}) AND ${product_prices.currency} = ${currency}`
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

    // Fetch option types for this product
    const optionTypeRows = await db
      .select()
      .from(product_option_types)
      .where(eq(product_option_types.product_id, id))
      .orderBy(product_option_types.sort_order);

    let allOptionValues: any[] = [];
    if (optionTypeRows.length > 0) {
      const otIds = optionTypeRows.map(ot => ot.id);
      const ovResult = await db.run(
        dbSql`SELECT * FROM ${product_option_values} WHERE ${product_option_values.option_type_id} IN (${dbSql.join(otIds.map(oid => dbSql`${oid}`))}) ORDER BY ${product_option_values.sort_order}`
      );
      allOptionValues = ovResult.rows as any[];
    }

    const enrichedVariants = variantRows.map(v => {
      const vov = variantOptionValues.filter(vo => vo.variant_id === v.id);
      const vp = variantPrices.filter(p => p.variant_id === v.id);
      return {
        id: v.id,
        sku: v.sku,
        stock: v.stock,
        option_values: vov.map(vo => {
          const ov = optionValues.find(o => o.id === vo.option_value_id);
          if (!ov) return null;
          const ot = optionTypes.find(t => t.id === ov.option_type_id);
          return {
            id: ov.id,
            option_type: ot?.label || '',
            value: ov.value,
            label: ov.label,
          };
        }).filter(Boolean),
        prices: vp.reduce((acc, p) => {
          acc[p.currency] = computeGross(p.price_net, vatRate);
          return acc;
        }, {} as Record<string, any>),
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: product.id,
          sku: product.sku,
          type: product.type,
          has_variants: product.has_variants,
          vat_rate: vatRate,
          stock: product.stock,
          category_id: product.category_id,
          active: product.active,
          name: trans?.name ?? product.name,
          description: trans?.description ?? product.description,
          slug: trans?.slug ?? product.slug,
          _locale: usedLocale,
          images: imageRows,
          prices: pricesByCurrency,
          variants: enrichedVariants,
          options: optionTypeRows.map(ot => ({
            ...ot,
            values: allOptionValues.filter(ov => ov.option_type_id === ot.id),
          })),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};