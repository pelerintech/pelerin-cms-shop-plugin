import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { listCategories } from '../../../src/lib/data/products.ts';

test('listCategories with search filters by name (case-insensitive)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);

    // Insert extra categories with distinct names
    await insertFixture(db, 'categories', {
      id: 'cat-electronics',
      parent_id: null,
      name: 'Electronics',
      slug: 'electronics',
      description: null,
      sort_order: 10,
      created_at: new Date(),
      updated_at: null,
    });
    await insertFixture(db, 'categories', {
      id: 'cat-clothing',
      parent_id: null,
      name: 'Clothing',
      slug: 'clothing',
      description: null,
      sort_order: 11,
      created_at: new Date(),
      updated_at: null,
    });
    await insertFixture(db, 'categories', {
      id: 'cat-electrical',
      parent_id: null,
      name: 'Electrical Parts',
      slug: 'electrical-parts',
      description: null,
      sort_order: 12,
      created_at: new Date(),
      updated_at: null,
    });

    // Search for "elec" should match Electronics and Electrical Parts, but not Clothing
    const results = await listCategories(db, 'ro', { search: 'elec' });
    const names = results.map((c) => c.name);

    assert.ok(names.includes('Electronics'), 'should include Electronics');
    assert.ok(names.includes('Electrical Parts'), 'should include Electrical Parts');
    assert.ok(!names.includes('Clothing'), 'should NOT include Clothing');
    assert.strictEqual(results.length, 2, 'should return exactly 2 results');
  } finally {
    await cleanup();
  }
});

test('listCategories with search filters by slug', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);

    await insertFixture(db, 'categories', {
      id: 'cat-gadgets',
      parent_id: null,
      name: 'Gadgets and Tools',
      slug: 'gadgets',
      description: null,
      sort_order: 20,
      created_at: new Date(),
      updated_at: null,
    });

    // Search by slug fragment
    const results = await listCategories(db, 'ro', { search: 'gadget' });
    assert.strictEqual(results.length, 1, 'should find by slug');
    assert.strictEqual(results[0].slug, 'gadgets');
  } finally {
    await cleanup();
  }
});

test('listCategories with search returns empty when no match', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const results = await listCategories(db, 'ro', { search: 'zzznonexistent' });
    assert.strictEqual(results.length, 0, 'should return empty array');
  } finally {
    await cleanup();
  }
});

test('listCategories without search returns all categories (backward compatible)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);

    // Insert one extra
    await insertFixture(db, 'categories', {
      id: 'cat-extra',
      parent_id: null,
      name: 'Extra Category',
      slug: 'extra',
      description: null,
      sort_order: 99,
      created_at: new Date(),
      updated_at: null,
    });

    // Without search param, should return all (seedMinimal creates 2 + 1 extra = 3)
    const results = await listCategories(db, 'ro');
    assert.ok(results.length >= 3, `should return all categories, got ${results.length}`);
  } finally {
    await cleanup();
  }
});

test('listCategories with search is case-insensitive', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);

    await insertFixture(db, 'categories', {
      id: 'cat-home',
      parent_id: null,
      name: 'Home & Garden',
      slug: 'home-garden',
      description: null,
      sort_order: 30,
      created_at: new Date(),
      updated_at: null,
    });

    // Search with uppercase
    const results = await listCategories(db, 'ro', { search: 'HOME' });
    assert.strictEqual(results.length, 1, 'should find with uppercase search');
    assert.strictEqual(results[0].name, 'Home & Garden');
  } finally {
    await cleanup();
  }
});
