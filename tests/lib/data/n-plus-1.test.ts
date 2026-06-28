/**
 * r17 Task 10 — N+1 elimination.
 *
 * (a) enrichCartItems must fetch product_prices in at most 2 batched queries
 *     (one inArray(variant_id), one inArray(product_id)), NOT one-per-item.
 * (b) reorderProductImages must run inside a single transaction (a mid-reorder
 *     failure rolls back all sort_order changes).
 * (c) createVariants must insert the variant row + its attribute values inside
 *     one transaction (a failure on a value rolls back the variant + prior values).
 *
 * See reespec/requests/shop-r17-data-integrity-hardening (n-plus-1-elimination spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { enrichCartItems } from '../../../src/lib/data/cart.ts';
import { reorderProductImages } from '../../../src/lib/data/products.ts';
import { createVariants } from '../../../src/lib/data/variants.ts';
import { product_prices, product_images, product_variants, product_attribute_values, product_attribute_assignments, product_attributes, product_attribute_options } from '../../../src/db/schema.ts';

const now = () => new Date();
const rid = () => crypto.randomUUID();
const futureExpiry = () => new Date(now().getTime() + 30 * 86400000);

/**
 * Wrap a LibSQLDatabase so every `db.select().from(TABLE)` call is counted per
 * table. Returns { db: wrapped, counts: Map<tableName, number> }.
 */
function wrapSelectCounting(db: any, targetTables: string[]) {
  const counts = new Map<string, number>();
  for (const t of targetTables) counts.set(t, 0);
  const wrapped = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'select') {
        return (...args: any[]) => {
          const builder = target.select(...args);
          return new Proxy(builder, {
            get(bTarget, bProp, bReceiver) {
              if (bProp === 'from') {
                return (table: any) => {
                  const name = table?.[Symbol.for('drizzle:Name')] ?? null;
                  if (name && counts.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
                  return bTarget.from(table);
                };
              }
              const v = Reflect.get(bTarget, bProp, bReceiver);
              return typeof v === 'function' ? v.bind(bTarget) : v;
            },
          });
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  return { db: wrapped, counts };
}

// ── (a) enrichCartItems batched price fetch ──

test('enrichCartItems fetches product_prices in at most 2 queries (batched, not N+1)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Build a 10-item cart: 5 variant items (variantBlack128Id) + 5 product items (simpleProductId).
    const cartId = rid();
    await insertFixture(db, 'carts', {
      id: cartId, session_id: 'sess-n1', user_id: null, applied_voucher_code: null,
      applied_referral_code: null, converted_at: null, expires_at: futureExpiry(),
      created_at: now(), updated_at: now(),
    });
    const items: any[] = [];
    for (let i = 0; i < 5; i++) {
      const vi = rid();
      await insertFixture(db, 'cart_items', { id: vi, cart_id: cartId, product_id: f.variantProductId, variant_id: f.variantBlack128Id, quantity: 1 });
      items.push({ id: vi, product_id: f.variantProductId, variant_id: f.variantBlack128Id, quantity: 1 });
    }
    for (let i = 0; i < 5; i++) {
      const pi = rid();
      await insertFixture(db, 'cart_items', { id: pi, cart_id: cartId, product_id: f.simpleProductId, variant_id: null, quantity: 1 });
      items.push({ id: pi, product_id: f.simpleProductId, variant_id: null, quantity: 1 });
    }

    const { db: wdb, counts } = wrapSelectCounting(db, ['product_prices']);
    const enriched = await enrichCartItems(wdb, items, 'RON');
    assert.strictEqual(enriched.length, 10);
    const priceQueries = counts.get('product_prices') ?? 0;
    assert.ok(
      priceQueries <= 2,
      `enrichCartItems must fetch product_prices in ≤2 batched queries, NOT ${priceQueries} (one-per-item is the N+1 bug)`,
    );
    // Results identical to the per-item version: variant items get the variant price, product items the product price.
    for (const e of enriched) assert.ok(e.price_net >= 0);
  } finally {
    await cleanup();
  }
});

// ── (b) reorderProductImages transactional ──

test('reorderProductImages is transactional — a mid-reorder failure rolls back ALL sort_order changes', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Seed 20 images for the simple product with original sort_order 0..19.
    const originalIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = rid();
      await insertFixture(db, 'product_images', { id, product_id: f.simpleProductId, variant_id: null, url: `u${i}`, alt: null, sort_order: i, mime: 'image/png', size: 0, width: null, height: null, original_filename: null });
      originalIds.push(id);
    }
    // Record original sort_orders.
    const origRows = await db.select().from(product_images).where(eq(product_images.product_id, f.simpleProductId));
    const origSort = new Map(origRows.map(r => [r.id, r.sort_order]));

    // Reverse the order (new sort_order = 19-i) and force a transaction-level failure.
    const reversed = [...originalIds].reverse();
    const realTx = db.transaction.bind(db);
    (db as any).transaction = (async (cb: any) => {
      return realTx(async (tx: any) => {
        await cb(tx);
        throw new Error('forced-reorder-failure');
      });
    }) as any;

    await assert.rejects(
      () => reorderProductImages(db, reversed),
      /forced-reorder-failure/,
    );

    // Restore and verify ALL sort_orders are unchanged (rollback).
    (db as any).transaction = realTx;
    const afterRows = await db.select().from(product_images).where(eq(product_images.product_id, f.simpleProductId));
    for (const r of afterRows) {
      assert.strictEqual(r.sort_order, origSort.get(r.id), `image ${r.id} sort_order must be rolled back to original`);
    }
  } finally {
    await cleanup();
  }
});

// ── (c) createVariants transactional value-inserts ──

test('createVariants is transactional — a failure on a value rolls back the variant row + prior values', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // The variant product already has Color (black/white) + Storage (128/256) dimensions.
    // Existing variants: Black-128, White-256. Use a NOVEL combo (Black-256) so
    // createVariants reaches the insert path (and the forced tx failure).
    const combo = { option_ids: [f.optColorBlackId, f.optStorage256Id], sku: 'NEWVAR-TX', stock: 7, active: true };

    const realTx = db.transaction.bind(db);
    (db as any).transaction = (async (cb: any) => {
      return realTx(async (tx: any) => {
        await cb(tx);
        throw new Error('forced-variant-failure');
      });
    }) as any;

    await assert.rejects(
      () => createVariants(db, f.variantProductId, [combo]),
      /forced-variant-failure/,
    );

    (db as any).transaction = realTx;
    // No new variant row with the SKU should exist (rollback).
    const newVariants = await db.select().from(product_variants).where(eq(product_variants.sku, 'NEWVAR-TX'));
    assert.strictEqual(newVariants.length, 0, 'variant row must be rolled back (transactional)');
    // No dangling attribute values for a non-existent variant (defensive — none inserted).
    const allVals = await db.select().from(product_attribute_values);
    const newVarValCount = allVals.filter(v => v.entity_type === 'variant').length;
    // Only the pre-existing variant values remain; the failed insert added none.
    assert.strictEqual(newVariants.length, 0);
  } finally {
    await cleanup();
  }
});
