import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, and, product_prices, sql as dbSql } from 'astro:db';
import { CreatePriceSchema } from '../../../../../schemas/product.schema.ts';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    // Get all prices for this product (product-level and variant-level)
    const rows = await db.run(
      dbSql`SELECT * FROM ${product_prices} WHERE ${product_prices.product_id} = ${id} OR ${product_prices.variant_id} IN (SELECT id FROM product_variants WHERE product_id = ${id})`
    );

    // Group by currency
    const grouped: Record<string, any[]> = {};
    for (const row of rows.rows as any[]) {
      if (!grouped[row.currency]) grouped[row.currency] = [];
      grouped[row.currency].push(row);
    }

    return new Response(JSON.stringify({ success: true, data: grouped }), {
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

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const body = await context.request.json();

    if (!Array.isArray(body.prices)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payload: prices must be an array' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate each price entry
    for (const price of body.prices) {
      const result = CreatePriceSchema.safeParse(price);
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
    }

    // Bulk upsert
    for (const price of body.prices) {
      const { product_id, variant_id, currency, price_net } = price;

      // Check if a price for this combination already exists
      let existing;
      if (product_id) {
        [existing] = await db
          .select()
          .from(product_prices)
          .where(
            and(
              eq(product_prices.product_id, product_id),
              eq(product_prices.currency, currency)
            )
          );
      } else if (variant_id) {
        [existing] = await db
          .select()
          .from(product_prices)
          .where(
            and(
              eq(product_prices.variant_id, variant_id),
              eq(product_prices.currency, currency)
            )
          );
      }

      if (existing) {
        // Update existing
        await db
          .update(product_prices)
          .set({ price_net })
          .where(eq(product_prices.id, existing.id));
      } else {
        // Insert new
        await db.insert(product_prices).values({
          id: crypto.randomUUID(),
          product_id,
          variant_id,
          currency,
          price_net,
        });
      }
    }

    // Return updated prices
    const updated = await db.run(
      dbSql`SELECT * FROM ${product_prices} WHERE ${product_prices.product_id} = ${id} OR ${product_prices.variant_id} IN (SELECT id FROM product_variants WHERE product_id = ${id})`
    );

    return new Response(JSON.stringify({ success: true, data: updated.rows }), {
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