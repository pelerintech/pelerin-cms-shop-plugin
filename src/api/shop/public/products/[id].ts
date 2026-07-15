import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { eq, inArray } from 'drizzle-orm';
import {
  products,
  product_prices,
  product_variants,
  product_images,
  product_attribute_assignments,
  product_attribute_values,
  product_attribute_options,
  product_attributes,
  translations,
} from '../../../../db/schema';
import { getProductWithPrices, listProductImage } from '../../../../lib/data/products';
import { listVariants } from '../../../../lib/data/variants';
import { getShopConfig } from '../../../../lib/data/settings';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const productId = ctx.params.id!;
    const url = new URL(ctx.request.url);
    const config = await getShopConfig(db);
    const locale = url.searchParams.get('locale') || config.defaultLocale;

    const product = await getProductWithPrices(db, productId, locale);
    if (!product || !product.active) {
      return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Images
    const images = await listProductImage(db, sdk, productId);

    // Variants
    const variants = await listVariants(db, productId, locale);

    return new Response(
      JSON.stringify({
        success: true,
        data: { ...product, images, variants },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
