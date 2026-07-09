/**
 * Regression test: the test harness must support `db.transaction()` calls that
 * throw and roll back DATA without destroying the SCHEMA.
 *
 * Under the old `drizzle(':memory:')` client, a throwing transaction rolls back
 * the entire connection state including `CREATE TABLE` — so a subsequent
 * `SELECT FROM products` throws "no such table". Under the migrated
 * `file::memory:?cache=shared` client, the schema survives and only the data
 * written inside the throwing transaction is rolled back.
 *
 * See reespec/requests/shop-r16-inventory-lifecycle (transactional-test-harness spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal } from './harness.ts';
import { products } from '../../src/db/schema.ts';

test('a throwing transaction rolls back data but keeps the schema', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);

    // Pre-throw state: the simple product exists.
    const before = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(before.length, 1, 'pre-throw: product row should exist');

    // Run a transaction that inserts a row then throws.
    await assert.rejects(
      () =>
        db.transaction(async (tx) => {
          await tx.insert(products).values({
            id: 'temp-tx-row',
            sku: 'TEMP-TX',
            type: 'physical',
            has_variants: false,
            vat_rate: 0.19,
            stock: 1,
            category_id: null,
            active: true,
            name: 'Temp TX',
            description: null,
            slug: 'temp-tx',
            created_at: new Date(),
            updated_at: new Date(),
          });
          throw new Error('boom');
        }),
      /boom/,
    );

    // Schema survives: a SELECT from products must NOT throw "no such table".
    const after = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(after.length, 1, 'post-rollback: pre-throw product row should still exist');

    // The row inserted inside the throwing transaction was rolled back.
    const tempRow = await db.select().from(products).where(eq(products.id, 'temp-tx-row'));
    assert.equal(tempRow.length, 0, 'post-rollback: in-tx insert must be rolled back');
  } finally {
    await cleanup();
  }
});

test('a committing transaction persists its data', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);

    await db.transaction(async (tx) => {
      await tx.insert(products).values({
        id: 'committed-tx-row',
        sku: 'COMMIT-TX',
        type: 'physical',
        has_variants: false,
        vat_rate: 0.19,
        stock: 1,
        category_id: null,
        active: true,
        name: 'Commit TX',
        description: null,
        slug: 'commit-tx',
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    const row = await db.select().from(products).where(eq(products.id, 'committed-tx-row'));
    assert.equal(row.length, 1, 'committed in-tx insert should persist');
  } finally {
    await cleanup();
  }
});
