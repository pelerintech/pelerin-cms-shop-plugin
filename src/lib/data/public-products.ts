/**
 * Public-facing product enrichment: batch-fetches prices, variants, variant prices,
 * and images for a list of already-translated product rows, then assembles the
 * enriched shape in-memory.
 *
 * This is the only file that knows about the public product response shape.
 * It accepts product rows that already have translations applied (from
 * `listProducts` in `products.ts`) and does NOT re-fetch translations.
 *
 * Price resolution order:
 *   1. Product-level price for the requested currency (variant_id IS NULL).
 *   2. Fallback: minimum variant-level price for the requested currency.
 *   3. No price → product is excluded from the result.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, asc, and, isNull } from 'drizzle-orm';
import { product_prices, product_variants, product_images } from '../../db/schema.ts';
import type { ProductListRow } from './products.ts';

/**
 * A single enriched product in the public list response.
 */
export interface EnrichedPublicProduct {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  slug: string;
  type: string;
  has_variants: boolean;
  vat_rate: number | null;
  stock: number | null;
  category_id: string | null;
  price_net: number;
  price_gross: number;
  vat_amount: number;
  currency: string;
  images: {
    url: string;
    alt: string | null;
    sort_order: number;
  }[];
  variants: {
    id: string;
    sku: string | null;
    stock: number | null;
    active: boolean;
    prices: { currency: string; price_net: number }[];
  }[];
}

export interface BatchEnrichOptions {
  /** The currency to resolve prices for (e.g. 'RON'). */
  currency: string;
  /** SDK with storage.getUrl for resolving image keys to URLs. */
  sdk: { storage: { getUrl: (key: string) => string | Promise<string> } };
}

/**
 * Given a list of product rows (already translated by `listProducts`),
 * batch-fetches prices, variants, variant prices, and images, then returns
 * the enriched shape.
 *
 * A product's price is resolved from product-level prices first, then falls
 * back to the minimum variant-level price for the requested currency.
 * Products without any price in the requested currency are excluded.
 */
export async function batchEnrichPublicProducts(
  db: LibSQLDatabase,
  products: ProductListRow[],
  opts: BatchEnrichOptions
): Promise<EnrichedPublicProduct[]> {
  const ids = products.map((p) => p.id);
  if (ids.length === 0) return [];

  // 1. Product-level prices (variant_id IS NULL)
  const prodPrices = await db
    .select()
    .from(product_prices)
    .where(and(inArray(product_prices.product_id, ids), isNull(product_prices.variant_id)));

  // 2. Variants
  const variants = await db
    .select()
    .from(product_variants)
    .where(inArray(product_variants.product_id, ids));

  // 3. Variant-level prices
  const variantIds = variants.map((v) => v.id);
  const varPrices =
    variantIds.length > 0
      ? await db.select().from(product_prices).where(inArray(product_prices.variant_id, variantIds))
      : [];

  // 4. Images
  const images = await db
    .select()
    .from(product_images)
    .where(inArray(product_images.product_id, ids))
    .orderBy(asc(product_images.sort_order));

  // Group in-memory
  const pricesByProduct = new Map<string, (typeof prodPrices)[number][]>();
  for (const pp of prodPrices) {
    if (!pricesByProduct.has(pp.product_id)) pricesByProduct.set(pp.product_id, []);
    pricesByProduct.get(pp.product_id)!.push(pp);
  }

  const variantsByProduct = new Map<string, (typeof variants)[number][]>();
  for (const v of variants) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id)!.push(v);
  }

  const pricesByVariant = new Map<string, (typeof varPrices)[number][]>();
  for (const vp of varPrices) {
    if (!pricesByVariant.has(vp.variant_id)) pricesByVariant.set(vp.variant_id, []);
    pricesByVariant.get(vp.variant_id)!.push(vp);
  }

  const imagesByProduct = new Map<string, (typeof images)[number][]>();
  for (const img of images) {
    if (!imagesByProduct.has(img.product_id)) imagesByProduct.set(img.product_id, []);
    imagesByProduct.get(img.product_id)!.push(img);
  }

  // Resolve image URLs
  const resolvedImagesByProduct = new Map<
    string,
    { url: string; alt: string | null; sort_order: number }[]
  >();
  for (const [pid, imgs] of imagesByProduct) {
    resolvedImagesByProduct.set(
      pid,
      await Promise.all(
        imgs.map(async (img) => ({
          url: await opts.sdk.storage.getUrl(img.url),
          alt: img.alt,
          sort_order: img.sort_order,
        }))
      )
    );
  }

  // Assemble
  const result: EnrichedPublicProduct[] = [];

  for (const product of products) {
    const productVariants = (variantsByProduct.get(product.id) ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      stock: v.stock,
      active: v.active,
      prices: (pricesByVariant.get(v.id) ?? []).map((vp) => ({
        currency: vp.currency,
        price_net: vp.price_net,
      })),
    }));

    // Resolve product price: product-level → min variant-level
    const matchedProdPrices = pricesByProduct.get(product.id) ?? [];
    let price = matchedProdPrices.find((p) => p.currency === opts.currency);

    if (!price && productVariants.length > 0) {
      // Fall back to the minimum variant price for the requested currency
      const varPricesForCurrency = productVariants
        .flatMap((v) => v.prices)
        .filter((vp) => vp.currency === opts.currency);
      if (varPricesForCurrency.length > 0) {
        const minVarPrice = Math.min(...varPricesForCurrency.map((vp) => vp.price_net));
        price = {
          id: '',
          product_id: product.id,
          variant_id: null,
          currency: opts.currency,
          price_net: minVarPrice,
        };
      }
    }

    if (!price) continue; // no price in requested currency → exclude

    const vatRate = product.vat_rate ?? 0;
    const priceGross = Math.round(price.price_net * (1 + vatRate) * 100) / 100;
    const vatAmount = Math.round((priceGross - price.price_net) * 100) / 100;

    result.push({
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      slug: product.slug,
      type: product.type,
      has_variants: productVariants.length > 0, // derived from actual variant rows
      vat_rate: product.vat_rate,
      stock: product.stock,
      category_id: product.category_id,
      price_net: price.price_net,
      price_gross: priceGross,
      vat_amount: vatAmount,
      currency: opts.currency,
      images: resolvedImagesByProduct.get(product.id) ?? [],
      variants: productVariants,
    });
  }

  return result;
}
