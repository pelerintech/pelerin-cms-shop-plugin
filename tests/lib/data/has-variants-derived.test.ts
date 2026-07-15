/**
 * Tests that `has_variants` is DERIVED at read time (true iff ≥1 variant row),
 * not read from the DB column (Task 11 of shop-r15).
 *
 * The DB column stays as a vestige; accessors override it with a computed value.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, insertFixture } from '../../db/harness.ts';
import { getProductById, listProducts } from '../../../src/lib/data/products.ts';
import { product_variants } from '../../../src/db/schema.ts';
import { eq } from 'drizzle-orm';

const NOW = new Date();
const rid = () => crypto.randomUUID();
let slugCounter = 0;
let skuCounter = 0;

async function seedProduct(db: any, productId: string, colHasVariants: boolean) {
  slugCounter++;
  skuCounter++;
  await insertFixture(db, 'products', {
    id: productId,
    sku: `P${skuCounter}`,
    type: 'physical',
    has_variants: colHasVariants,
    vat_rate: 0.19,
    stock: 10,
    category_id: null,
    active: true,
    name: 'P',
    description: '',
    slug: `p-${slugCounter}`,
    created_at: NOW,
    updated_at: NOW,
  });
}

test('getProductById derives has_variants=true from actual variant rows, not the column', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const productId = rid();
    // Column says false; no variants → derived false.
    await seedProduct(db, productId, false);
    let p = await getProductById(db, productId);
    assert.ok(p);
    assert.strictEqual(p!.has_variants, false, 'no variants → false even if column said false');

    // Add a variant → derived true (column still false).
    await insertFixture(db, 'product_variants', {
      id: rid(),
      product_id: productId,
      sku: 'V1',
      stock: 1,
      active: true,
    });
    p = await getProductById(db, productId);
    assert.strictEqual(
      p!.has_variants,
      true,
      'has a variant row → true, ignoring the false column'
    );

    // Delete the variant → derived false again.
    await db.delete(product_variants).where(eq(product_variants.product_id, productId));
    p = await getProductById(db, productId);
    assert.strictEqual(p!.has_variants, false, 'variant deleted → false (recomputed, not stale)');
  } finally {
    await cleanup();
  }
});

test('getProductById derives false when column says true but no variant rows exist', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const productId = rid();
    // Column LIES (true) but there are no variant rows.
    await seedProduct(db, productId, true);
    const p = await getProductById(db, productId);
    assert.ok(p);
    assert.strictEqual(
      p!.has_variants,
      false,
      'column true but no variants → derived false (column ignored at read)'
    );
  } finally {
    await cleanup();
  }
});

test('listProducts derives has_variants per product from actual variant rows', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const withVariants = rid();
    const withoutVariants = rid();
    await seedProduct(db, withVariants, false);
    await seedProduct(db, withoutVariants, false);
    await insertFixture(db, 'product_variants', {
      id: rid(),
      product_id: withVariants,
      sku: 'V',
      stock: 1,
      active: true,
    });

    const result = await listProducts(db, { limit: 100 });
    const a = result.products.find((p) => p.id === withVariants);
    const b = result.products.find((p) => p.id === withoutVariants);
    assert.ok(a && b);
    assert.strictEqual(a!.has_variants, true);
    assert.strictEqual(b!.has_variants, false);
  } finally {
    await cleanup();
  }
});
