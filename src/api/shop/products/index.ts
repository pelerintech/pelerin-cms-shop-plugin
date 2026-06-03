import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, and, products, translations, product_prices, sql as dbSql } from 'astro:db';
import { CreateProductSchema } from '../../../schemas/product.schema';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const url = new URL(context.request.url);
    const category = url.searchParams.get('category');
    const type = url.searchParams.get('type');
    const active = url.searchParams.get('active');
    const search = url.searchParams.get('search');
    const locale = url.searchParams.get('locale') || 'ro';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build where conditions using dbSql for dynamic filters
    const conditions: any[] = [];

    if (category) {
      conditions.push(dbSql`${products.category_id} = ${category}`);
    }
    if (type) {
      conditions.push(dbSql`${products.type} = ${type}`);
    }
    if (active !== null && active !== undefined) {
      conditions.push(dbSql`${products.active} = ${active === 'true' ? 1 : 0}`);
    }
    if (search) {
      const s = search.replace(/'/g, "''");
      conditions.push(dbSql.raw(`(LOWER(p.name) LIKE LOWER('%${s}%') OR LOWER(p.sku) LIKE LOWER('%${s}%') OR p.id LIKE '%${s}%')`));
    }

    // Get total count
    let countResult;
    if (conditions.length > 0) {
      countResult = await db.run(
        dbSql`SELECT COUNT(*) as total FROM ${products} p WHERE ${dbSql.join(conditions, ' AND ')}`
      );
    } else {
      countResult = await db.run(dbSql`SELECT COUNT(*) as total FROM ${products} p`);
    }
    const total = (countResult.rows[0] as any).total as number;

    // Fetch products with pagination
    let productRows;
    if (conditions.length > 0) {
      productRows = await db.run(
        dbSql`SELECT p.* FROM ${products} p WHERE ${dbSql.join(conditions, ' AND ')} ORDER BY p.name LIMIT ${limit} OFFSET ${offset}`
      );
    } else {
      productRows = await db.run(
        dbSql`SELECT p.* FROM ${products} p ORDER BY p.name LIMIT ${limit} OFFSET ${offset}`
      );
    }

    const productList = productRows.rows as any[];

    // Fetch translations for these products
    const productIds = productList.map(p => p.id);
    let translationRows: any[] = [];
    if (productIds.length > 0) {
      const transResult = await db.run(
        dbSql`SELECT * FROM ${translations} WHERE ${translations.entity_type} = 'product' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(productIds.map(id => dbSql`${id}`))})`
      );
      translationRows = transResult.rows as any[];
    }

    const transMap = new Map(translationRows.map((t: any) => [t.entity_id, t]));

    const enriched = productList.map(p => {
      const t = transMap.get(p.id);
      return {
        ...p,
        name: t?.name ?? p.name,
        description: t?.description ?? p.description,
        slug: t?.slug ?? p.slug,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: enriched,
        meta: { total, page, limit },
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

export const POST: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const body = await context.request.json();
    const result = CreateProductSchema.safeParse(body);

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

    const { sku, type, has_variants, vat_rate, stock, category_id, active, name, description, slug } = result.data;

    // Extract locale fields from body (name_en, slug_en, description_en, etc.)
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

    // Check for duplicate SKU
    if (sku) {
      const existingSku = await db.run(
        dbSql`SELECT id FROM ${products} WHERE ${products.sku} = ${sku} LIMIT 1`
      );
      if (existingSku.rows.length > 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Duplicate SKU' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const id = crypto.randomUUID();

    const now = new Date();
    await db.insert(products).values({
      id,
      sku,
      type,
      has_variants,
      vat_rate,
      stock,
      category_id,
      active,
      name,
      description,
      slug,
      created_at: now,
      updated_at: now,
    });

    // Insert default locale translation
    await db.insert(translations).values({
      id: crypto.randomUUID(),
      entity_type: 'product',
      entity_id: id,
      locale: defaultLocale,
      name,
      description,
      slug,
      label: null,
    });

    // Insert translations for non-default locales
    for (const [locale, fields] of Object.entries(localeFields)) {
      if (locale === defaultLocale) continue;
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

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id,
          sku,
          type,
          has_variants,
          vat_rate,
          stock,
          category_id,
          active,
          name,
          description,
          slug,
        },
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
