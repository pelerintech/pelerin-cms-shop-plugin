import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb } from './harness.ts';
import { products } from '../../src/db/schema.ts';
import { sql, inArray } from 'drizzle-orm';

test('raw parameterized query with interpolated params works in harness', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const now = new Date();
    await db.insert(products).values([
      {
        id: 'pA',
        sku: 'A',
        type: 'physical',
        has_variants: false,
        vat_rate: null,
        stock: 1,
        category_id: null,
        active: true,
        name: 'A',
        description: null,
        slug: 'a',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'pB',
        sku: 'B',
        type: 'physical',
        has_variants: false,
        vat_rate: null,
        stock: 1,
        category_id: null,
        active: true,
        name: 'B',
        description: null,
        slug: 'b',
        created_at: now,
        updated_at: now,
      },
    ]);

    // D3 raw idiom: build placeholders via sql.raw for the IN list, bind values
    // by interpolating them as drizzle params (NOT positional db.run args, which
    // drizzle-orm/libsql does not bind — see decision log).
    const ids = ['pA', 'pB'];
    const placeholders = ids.map(() => '?').join(',');
    const result = await db.run(
      sql`SELECT * FROM ${products} WHERE ${products.id} IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql.raw(',')
      )})`
    );
    assert.ok(result.rows, 'must return rows');
    assert.strictEqual((result.rows as any[]).length, 2, 'must match both IDs');
  } finally {
    await cleanup();
  }
});

test('inArray operator with populated array works in harness', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const now = new Date();
    await db.insert(products).values([
      {
        id: 'pA',
        sku: 'A',
        type: 'physical',
        has_variants: false,
        vat_rate: null,
        stock: 1,
        category_id: null,
        active: true,
        name: 'A',
        description: null,
        slug: 'a',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'pB',
        sku: 'B',
        type: 'physical',
        has_variants: false,
        vat_rate: null,
        stock: 1,
        category_id: null,
        active: true,
        name: 'B',
        description: null,
        slug: 'b',
        created_at: now,
        updated_at: now,
      },
    ]);

    const rows = await db
      .select()
      .from(products)
      .where(inArray(products.id, ['pA']))
      .all();
    assert.strictEqual(rows.length, 1, 'inArray with single element must return 1 row');
    assert.strictEqual(rows[0].id, 'pA');
  } finally {
    await cleanup();
  }
});

test('inArray operator with EMPTY array executes without error (no near "?" syntax error)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const now = new Date();
    await db.insert(products).values([
      {
        id: 'pA',
        sku: 'A',
        type: 'physical',
        has_variants: false,
        vat_rate: null,
        stock: 1,
        category_id: null,
        active: true,
        name: 'A',
        description: null,
        slug: 'a',
        created_at: now,
        updated_at: now,
      },
    ]);

    // This is the core regression guard: empty inArray must NOT throw "near ?" syntax error
    const rows = await db.select().from(products).where(inArray(products.id, [])).all();
    assert.strictEqual(rows.length, 0, 'empty inArray must return 0 rows');
  } finally {
    await cleanup();
  }
});
