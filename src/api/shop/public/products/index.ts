import type { APIRoute } from 'astro';
import { db, eq, products, translations, product_prices, sql as dbSql } from 'astro:db';

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
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const category = url.searchParams.get('category');

    // Count active products
    let countResult;
    if (category) {
      countResult = await db.run(
        dbSql`SELECT COUNT(*) as total FROM ${products} WHERE ${products.active} = 1 AND ${products.category_id} = ${category}`
      );
    } else {
      countResult = await db.run(
        dbSql`SELECT COUNT(*) as total FROM ${products} WHERE ${products.active} = 1`
      );
    }
    const total = (countResult.rows[0] as any).total as number;

    // Fetch active products
    let productRows;
    if (category) {
      productRows = await db.run(
        dbSql`SELECT * FROM ${products} WHERE ${products.active} = 1 AND ${products.category_id} = ${category} ORDER BY ${products.name} LIMIT ${limit} OFFSET ${offset}`
      );
    } else {
      productRows = await db.run(
        dbSql`SELECT * FROM ${products} WHERE ${products.active} = 1 ORDER BY ${products.name} LIMIT ${limit} OFFSET ${offset}`
      );
    }

    const productList = productRows.rows as any[];

    // Fetch translations
    let translationRows: any[] = [];
    if (productList.length > 0) {
      const productIds = productList.map(p => p.id);
      const tResult = await db.run(
        dbSql`SELECT * FROM ${translations} WHERE ${translations.entity_type} = 'product' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(productIds.map(id => dbSql`${id}`))})`
      );
      translationRows = tResult.rows as any[];
    }
    const transMap = new Map(translationRows.map((t: any) => [t.entity_id, t]));

    // Fetch product-level prices for the requested currency
    let priceRows: any[] = [];
    if (productList.length > 0) {
      const pResult = await db.run(
        dbSql`SELECT * FROM ${product_prices} WHERE ${product_prices.product_id} IN (${dbSql.join(productList.map(p => dbSql`${p.id}`))}) AND ${product_prices.currency} = ${currency}`
      );
      priceRows = pResult.rows as any[];
    }
    const pricesByProduct = new Map(priceRows.map((p: any) => [p.product_id, p]));

    const enriched = productList.map(p => {
      const t = transMap.get(p.id);
      const priceRow = pricesByProduct.get(p.id);
      const usedLocale = t ? locale : 'ro'; // fallback
      const result: any = {
        id: p.id,
        sku: p.sku,
        type: p.type,
        has_variants: p.has_variants,
        category_id: p.category_id,
        name: t?.name ?? p.name,
        description: t?.description ?? p.description,
        slug: t?.slug ?? p.slug,
        _locale: usedLocale,
      };
      if (priceRow) {
        result.price = computeGross(priceRow.price_net, p.vat_rate);
      }
      return result;
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
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};