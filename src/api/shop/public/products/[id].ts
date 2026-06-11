import type { APIRoute } from 'astro';
import {
  db,
  products,
  translations,
  product_prices,
  product_images,
  product_variants,
  product_attribute_values,
  product_attribute_assignments,
  product_attributes,
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
      .where(dbSql`${products.id} = ${id} AND ${products.active} = 1`);

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
        dbSql`${translations.entity_type} = 'product' AND ${translations.entity_id} = ${id} AND ${translations.locale} = ${locale}`
      );

    let usedLocale = locale;
    if (!trans) {
      usedLocale = 'ro';
      [trans] = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product' AND ${translations.entity_id} = ${id} AND ${translations.locale} = 'ro'`
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
      .where(dbSql`${product_images.product_id} = ${id}`)
      .orderBy(product_images.sort_order);

    // ─── Product-level field attributes ───
    const fieldAssignments = await db
      .select()
      .from(product_attribute_assignments)
      .where(
        dbSql`${product_attribute_assignments.product_id} = ${id} AND ${product_attribute_assignments.role} = 'field'`
      )
      .orderBy(product_attribute_assignments.sort_order);

    const productAttributes: any[] = [];
    if (fieldAssignments.length > 0) {
      const fieldAssignmentIds = fieldAssignments.map(a => a.id);
      const fieldAttributeIds = fieldAssignments.map(a => a.attribute_id);

      // Fetch attribute details
      const attrs = await db
        .select()
        .from(product_attributes)
        .where(
          dbSql`${product_attributes.id} IN (${dbSql.join(fieldAttributeIds.map(id => dbSql`${id}`))})`
        );
      const attrsMap = new Map(attrs.map(a => [a.id, a]));

      // Fetch translations for attribute names
      const attrTransRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute' AND ${translations.locale} = ${usedLocale} AND ${translations.entity_id} IN (${dbSql.join(fieldAttributeIds.map(id => dbSql`${id}`))})`
        );
      const attrTransMap = new Map(attrTransRows.filter(t => t.name).map(t => [t.entity_id, t.name]));

      // Fetch product-level values
      const valResult = await db.run(
        dbSql`SELECT * FROM ${product_attribute_values} WHERE ${product_attribute_values.entity_type} = 'product' AND ${product_attribute_values.entity_id} = ${id} AND ${product_attribute_values.assignment_id} IN (${dbSql.join(fieldAssignmentIds.map(id => dbSql`${id}`))})`
      );
      const values = valResult.rows as any[];

      // Fetch option labels for select-type values
      const optionIds = Array.from(new Set(values.filter(v => v.option_id).map(v => v.option_id)));
      const optionLabelsMap = new Map<string, string>();
      if (optionIds.length > 0) {
        const optTransRows = await db
          .select()
          .from(translations)
          .where(
            dbSql`${translations.entity_type} = 'product_attribute_option' AND ${translations.locale} = ${usedLocale} AND ${translations.entity_id} IN (${dbSql.join(optionIds.map(id => dbSql`${id}`))})`
          );
        for (const t of optTransRows) {
          if (t.label) optionLabelsMap.set(t.entity_id, t.label);
        }
      }

      for (const assignment of fieldAssignments) {
        const attr = attrsMap.get(assignment.attribute_id);
        const val = values.find(v => v.assignment_id === assignment.id);

        let value: string | number | boolean | null = null;
        if (val) {
          if (val.option_id) {
            value = optionLabelsMap.get(val.option_id) || val.option_id;
          } else if (val.value_text !== null) {
            value = val.value_text;
          } else if (val.value_number !== null) {
            value = val.value_number;
          } else if (val.value_boolean !== null) {
            value = val.value_boolean;
          }
        }

        productAttributes.push({
          name: attrTransMap.get(assignment.attribute_id) || attr?.name || '',
          type: attr?.type || '',
          role: 'field',
          value,
        });
      }
    }

    // ─── Variants ───
    const variantRows = await db
      .select()
      .from(product_variants)
      .where(dbSql`${product_variants.product_id} = ${id} AND ${product_variants.active} = 1`);

    let variantAttrValues: any[] = [];
    let variantPrices: any[] = [];

    if (variantRows.length > 0) {
      const variantIds = variantRows.map(v => v.id);

      // Fetch variant-level attribute values (dimensions)
      const vavResult = await db.run(
        dbSql`SELECT * FROM ${product_attribute_values} WHERE ${product_attribute_values.entity_type} = 'variant' AND ${product_attribute_values.entity_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantAttrValues = vavResult.rows as any[];

      // Fetch variant prices
      const vpResult = await db.run(
        dbSql`SELECT * FROM ${product_prices} WHERE ${product_prices.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))}) AND ${product_prices.currency} = ${currency}`
      );
      variantPrices = vpResult.rows as any[];
    }

    // Fetch assignment details for variant values
    const assignmentIds = Array.from(new Set(variantAttrValues.map(v => v.assignment_id)));
    const assignmentsMap = new Map<string, any>();
    const attributesMap = new Map<string, any>();
    const attrTransMap = new Map<string, string>();

    if (assignmentIds.length > 0) {
      const assignments = await db
        .select()
        .from(product_attribute_assignments)
        .where(
          dbSql`${product_attribute_assignments.id} IN (${dbSql.join(assignmentIds.map(id => dbSql`${id}`))})`
        );
      for (const a of assignments) {
        assignmentsMap.set(a.id, a);
      }

      const attributeIds = Array.from(new Set(assignments.map(a => a.attribute_id)));
      const attrs = await db
        .select()
        .from(product_attributes)
        .where(
          dbSql`${product_attributes.id} IN (${dbSql.join(attributeIds.map(id => dbSql`${id}`))})`
        );
      for (const attr of attrs) {
        attributesMap.set(attr.id, attr);
      }

      // Fetch translations for attribute names
      const attrTransRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute' AND ${translations.locale} = ${usedLocale} AND ${translations.entity_id} IN (${dbSql.join(attributeIds.map(id => dbSql`${id}`))})`
        );
      for (const t of attrTransRows) {
        if (t.name) attrTransMap.set(t.entity_id, t.name);
      }
    }

    // Fetch option labels for select-type values
    const optionIds = Array.from(new Set(variantAttrValues.filter(v => v.option_id).map(v => v.option_id)));
    const optionLabelsMap = new Map<string, string>();
    if (optionIds.length > 0) {
      const optTransRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute_option' AND ${translations.locale} = ${usedLocale} AND ${translations.entity_id} IN (${dbSql.join(optionIds.map(id => dbSql`${id}`))})`
        );
      for (const t of optTransRows) {
        if (t.label) optionLabelsMap.set(t.entity_id, t.label);
      }
    }

    const enrichedVariants = variantRows.map(v => {
      const vav = variantAttrValues.filter(val => val.entity_id === v.id);
      const vp = variantPrices.filter(p => p.variant_id === v.id);

      const attributes = vav.map(val => {
        const assignment = assignmentsMap.get(val.assignment_id);
        const attr = assignment ? attributesMap.get(assignment.attribute_id) : null;
        const attrName = attr ? (attrTransMap.get(attr.id) || attr.name) : '';

        let value: string | number | boolean | null = null;
        if (val.option_id) {
          value = optionLabelsMap.get(val.option_id) || val.option_id;
        } else if (val.value_text !== null) {
          value = val.value_text;
        } else if (val.value_number !== null) {
          value = val.value_number;
        } else if (val.value_boolean !== null) {
          value = val.value_boolean;
        }

        return {
          name: attrName,
          type: attr?.type || '',
          role: assignment?.role || 'dimension',
          value,
        };
      });

      return {
        id: v.id,
        sku: v.sku,
        stock: v.stock,
        attributes,
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
          attributes: productAttributes,
          variants: enrichedVariants,
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
