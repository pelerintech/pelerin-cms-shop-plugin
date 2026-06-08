import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  db, eq, and,
  products, translations, product_prices, product_images,
  product_variants,
  product_attribute_values, product_attribute_assignments, product_attributes,
  sql as dbSql,
} from 'astro:db';
import { UpdateProductSchema } from '../../../schemas/product.schema'

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;
    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

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

    // Fetch variants
    const variantRows = await db
      .select()
      .from(product_variants)
      .where(eq(product_variants.product_id, id));

    // Fetch variant-level attribute values and prices
    let variantAttrValues: any[] = [];
    let variantPrices: any[] = [];
    if (variantRows.length > 0) {
      const variantIds = variantRows.map(v => v.id);
      const vavResult = await db.run(
        dbSql`SELECT * FROM ${product_attribute_values} WHERE ${product_attribute_values.entity_type} = 'variant' AND ${product_attribute_values.entity_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantAttrValues = vavResult.rows as any[];

      const vpResult = await db.run(
        dbSql`SELECT * FROM ${product_prices} WHERE ${product_prices.variant_id} IN (${dbSql.join(variantIds.map(vid => dbSql`${vid}`))})`
      );
      variantPrices = vpResult.rows as any[];
    }

    // Fetch assignment details for variant values
    const assignmentIds = Array.from(new Set(variantAttrValues.map(v => v.assignment_id)));
    const assignmentsMap = new Map<string, any>();
    if (assignmentIds.length > 0) {
      const assignments = await db
        .select()
        .from(product_attribute_assignments)
        .where(
          dbSql`${product_attribute_assignments.id} IN (${dbSql.join(assignmentIds.map(aid => dbSql`${aid}`))})`
        );
      for (const a of assignments) {
        assignmentsMap.set(a.id, a);
      }
    }

    // Fetch attribute details
    const attributeIds = Array.from(new Set(
      Array.from(assignmentsMap.values()).map(a => a.attribute_id)
    ));
    const attributesMap = new Map<string, any>();
    const attrTransMap = new Map<string, string>();
    if (attributeIds.length > 0) {
      const attrs = await db
        .select()
        .from(product_attributes)
        .where(
          dbSql`${product_attributes.id} IN (${dbSql.join(attributeIds.map(aid => dbSql`${aid}`))})`
        );
      for (const attr of attrs) {
        attributesMap.set(attr.id, attr);
      }

      const attrTransRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(attributeIds.map(aid => dbSql`${aid}`))})`
        );
      for (const t of attrTransRows) {
        if (t.name) attrTransMap.set(t.entity_id, t.name);
      }
    }

    // Fetch option labels for select-type values
    const optionIds = Array.from(new Set(
      variantAttrValues.filter(v => v.option_id).map(v => v.option_id)
    ));
    const optionLabelsMap = new Map<string, string>();
    if (optionIds.length > 0) {
      const optTransRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute_option' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(optionIds.map(oid => dbSql`${oid}`))})`
        );
      for (const t of optTransRows) {
        if (t.label) optionLabelsMap.set(t.entity_id, t.label);
      }
    }

    // Enrich variants with attribute values and prices
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
          attribute_id: attr?.id || '',
          attribute_name: attrName,
          attribute_type: attr?.type || '',
          role: assignment?.role || '',
          value,
        };
      });

      return {
        id: v.id,
        product_id: v.product_id,
        sku: v.sku,
        stock: v.stock,
        active: v.active,
        attributes,
        prices: vp.map(p => ({ currency: p.currency, price_net: p.price_net })),
      };
    });

    // Fetch product-level attribute assignments (both dimension and field)
    const productAssignments = await db
      .select()
      .from(product_attribute_assignments)
      .where(eq(product_attribute_assignments.product_id, id))
      .orderBy(product_attribute_assignments.sort_order);

    const productAssignmentsData: any[] = [];
    if (productAssignments.length > 0) {
      const pAssignmentIds = productAssignments.map(a => a.id);
      const pAttributeIds = productAssignments.map(a => a.attribute_id);

      const pAttrs = await db
        .select()
        .from(product_attributes)
        .where(
          dbSql`${product_attributes.id} IN (${dbSql.join(pAttributeIds.map(aid => dbSql`${aid}`))})`
        );
      const pAttrsMap = new Map(pAttrs.map(a => [a.id, a]));

      const pAttrTransRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'product_attribute' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(pAttributeIds.map(aid => dbSql`${aid}`))})`
        );
      const pAttrTransMap = new Map(pAttrTransRows.filter(t => t.name).map(t => [t.entity_id, t.name]));

      // Fetch product-level field values
      const pValResult = await db.run(
        dbSql`SELECT * FROM ${product_attribute_values} WHERE ${product_attribute_values.entity_type} = 'product' AND ${product_attribute_values.entity_id} = ${id} AND ${product_attribute_values.assignment_id} IN (${dbSql.join(pAssignmentIds.map(aid => dbSql`${aid}`))})`
      );
      const pValues = pValResult.rows as any[];

      for (const assignment of productAssignments) {
        const attr = pAttrsMap.get(assignment.attribute_id);
        const val = pValues.find(v => v.assignment_id === assignment.id);

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

        productAssignmentsData.push({
          assignment_id: assignment.id,
          attribute_id: assignment.attribute_id,
          attribute_name: pAttrTransMap.get(assignment.attribute_id) || attr?.name || '',
          attribute_type: attr?.type || '',
          role: assignment.role,
          offered_option_ids: assignment.offered_option_ids ? JSON.parse(assignment.offered_option_ids) : [],
          value,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...product,
          translations: transRows,
          prices: priceRows.map(p => ({ currency: p.currency, price_net: p.price_net })),
          images: imageRows,
          variants: enrichedVariants,
          attribute_assignments: productAssignmentsData,
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
      updateData.updated_at = new Date();
      await db.update(products).set(updateData).where(eq(products.id, id));
    }

    // Handle locale translations from body (name_en, slug_en, description_en, etc.)
    const defaultLocale = (body as any).default_locale || 'ro';
    const localeFields: Record<string, { name?: string; slug?: string; description?: string }> = {};
    for (const [key, val] of Object.entries(body)) {
      const match = key.match(/^(name|slug|description)_(\w+)$/);
      if (match && val) {
        const [, field, locale] = match;
        if (!localeFields[locale]) localeFields[locale] = {};
        localeFields[locale][field as keyof typeof localeFields[locale]] = val as string;
      }
    }

    for (const [locale, fields] of Object.entries(localeFields)) {
      if (locale === defaultLocale) continue;
      const existing = await db
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product'),
            eq(translations.entity_id, id),
            eq(translations.locale, locale)
          )
        );

      if (existing.length > 0) {
        // Update existing translation
        await db
          .update(translations)
          .set({
            name: fields.name || null,
            description: fields.description || null,
            slug: fields.slug || null,
          })
          .where(
            and(
              eq(translations.entity_type, 'product'),
              eq(translations.entity_id, id),
              eq(translations.locale, locale)
            )
          );
      } else {
        // Insert new translation
        await db.insert(translations).values({
          id: crypto.randomUUID(),
          entity_type: 'product',
          entity_id: id,
          locale,
          name: fields.name || null,
          description: fields.description || null,
          slug: fields.slug || null,
          label: null,
        });
      }
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
