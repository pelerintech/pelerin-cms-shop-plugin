import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb } from './harness.ts';
import { products } from '../../src/db/schema.ts';

test('createTestDb returns a truthy db and a cleanup function', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    assert.ok(db, 'db must be returned');
    assert.strictEqual(typeof cleanup, 'function', 'cleanup must be a function');
  } finally {
    await cleanup();
  }
});

test('all plugin tables exist in the test database — querying an empty table does not error', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    // A select against an existing empty table returns [], not an error.
    const rows = await db.select().from(products).all();
    assert.ok(Array.isArray(rows), 'select must return an array');
    assert.strictEqual(rows.length, 0, 'empty products table must return 0 rows');
  } finally {
    await cleanup();
  }
});

test('cleanup runs without error', async () => {
  const { cleanup } = await createTestDb();
  // Must not throw
  await cleanup();
  assert.ok(true, 'cleanup completed');
});
