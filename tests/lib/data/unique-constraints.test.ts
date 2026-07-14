import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, insertFixture, type TestDb } from '../../db/harness.ts';
import {
  vouchers,
  products,
  referral_codes,
  translations,
  shop_settings,
} from '../../../src/db/schema.ts';

/**
 * Assert that a rejected promise has a UNIQUE constraint violation either in its
 * top-level message or in its .cause chain (newer drizzle-orm/libsql versions
 * nest the DB error as .cause on a wrapping 'Failed query' Error).
 */
async function assertUniqueConstraint(fn: () => Promise<any>): Promise<void> {
  try {
    await fn();
    assert.fail('Expected UNIQUE constraint violation but promise resolved');
  } catch (err: any) {
    const msg = err?.message ?? '';
    const causeMsg = err?.cause?.message ?? '';
    if (!/UNIQUE constraint failed/i.test(msg) && !/UNIQUE constraint failed/i.test(causeMsg)) {
      assert.fail(`Expected UNIQUE constraint violation, got: ${msg} (cause: ${causeMsg})`);
    }
  }
}

let env: TestDb;
test('unique-constraints: setup', async () => {
  env = await createTestDb();
  assert.ok(env.db);
});

test('vouchers.code is UNIQUE — duplicate code throws', async () => {
  const { db } = env;
  await insertFixture(db, 'vouchers', {
    id: 'v1',
    code: 'DUPCODE',
    type: 'fixed_amount',
    value: 100,
    min_order_value: null,
    max_uses: null,
    uses_count: 0,
    valid_from: null,
    valid_until: null,
    single_use_per_customer: false,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await assertUniqueConstraint(() =>
    insertFixture(db, 'vouchers', {
      id: 'v2',
      code: 'DUPCODE',
      type: 'percentage',
      value: 10,
      min_order_value: null,
      max_uses: null,
      uses_count: 0,
      valid_from: null,
      valid_until: null,
      single_use_per_customer: false,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    })
  );
});

test('referral_codes.code is UNIQUE — duplicate throws', async () => {
  const { db } = env;
  await insertFixture(db, 'referral_codes', {
    id: 'r1',
    code: 'PARTNER',
    name: 'P1',
    discount_type: 'percentage',
    discount_value: 10,
    active: true,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await assertUniqueConstraint(() =>
    insertFixture(db, 'referral_codes', {
      id: 'r2',
      code: 'PARTNER',
      name: 'P2',
      discount_type: 'percentage',
      discount_value: 5,
      active: true,
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    })
  );
});

test('shop_settings.key is UNIQUE — duplicate throws', async () => {
  const { db } = env;
  await insertFixture(db, 'shop_settings', { id: 's1', key: 'locales', value: '[]' });
  await assertUniqueConstraint(() =>
    insertFixture(db, 'shop_settings', { id: 's2', key: 'locales', value: '{}' })
  );
});

test('products.sku is UNIQUE — duplicate non-null sku throws', async () => {
  const { db } = env;
  const now = new Date();
  await insertFixture(db, 'products', {
    id: 'p1',
    sku: 'SKU-001',
    type: 'physical',
    has_variants: false,
    vat_rate: 0.19,
    stock: 10,
    category_id: null,
    active: true,
    name: 'A',
    description: null,
    slug: 'a',
    created_at: now,
    updated_at: now,
  });
  await assertUniqueConstraint(() =>
    insertFixture(db, 'products', {
      id: 'p2',
      sku: 'SKU-001',
      type: 'physical',
      has_variants: false,
      vat_rate: 0.19,
      stock: 5,
      category_id: null,
      active: true,
      name: 'B',
      description: null,
      slug: 'b',
      created_at: now,
      updated_at: now,
    })
  );
});

test('products.sku is nullable — multiple NULLs are allowed (SQLite UNIQUE on NULL)', async () => {
  const { db } = env;
  const now = new Date();
  // First NULL product already inserted in the previous test (p-with-null). Insert
  // a fresh pair of NULL-sku products to assert multiple NULLs coexist.
  await insertFixture(db, 'products', {
    id: 'n1',
    sku: null,
    type: 'physical',
    has_variants: false,
    vat_rate: 0.19,
    stock: 1,
    category_id: null,
    active: true,
    name: 'N1',
    description: null,
    slug: 'n1',
    created_at: now,
    updated_at: now,
  });
  await insertFixture(db, 'products', {
    id: 'n2',
    sku: null,
    type: 'physical',
    has_variants: false,
    vat_rate: 0.19,
    stock: 2,
    category_id: null,
    active: true,
    name: 'N2',
    description: null,
    slug: 'n2',
    created_at: now,
    updated_at: now,
  });
  const rows = await db.select().from(products);
  const nullSku = rows.filter((r) => r.sku === null);
  assert.ok(nullSku.length >= 2, `expected >=2 NULL-sku products, found ${nullSku.length}`);
});

test('products.slug is UNIQUE — duplicate slug throws', async () => {
  const { db } = env;
  const now = new Date();
  await insertFixture(db, 'products', {
    id: 'sl1',
    sku: null,
    type: 'physical',
    has_variants: false,
    vat_rate: 0.19,
    stock: 1,
    category_id: null,
    active: true,
    name: 'SL1',
    description: null,
    slug: 'same-slug',
    created_at: now,
    updated_at: now,
  });
  await assertUniqueConstraint(() =>
    insertFixture(db, 'products', {
      id: 'sl2',
      sku: null,
      type: 'physical',
      has_variants: false,
      vat_rate: 0.19,
      stock: 2,
      category_id: null,
      active: true,
      name: 'SL2',
      description: null,
      slug: 'same-slug',
      created_at: now,
      updated_at: now,
    })
  );
});

test('categories.slug is UNIQUE — duplicate throws', async () => {
  const { db } = env;
  await insertFixture(db, 'categories', {
    id: 'c1',
    parent_id: null,
    name: 'C1',
    description: null,
    slug: 'cat-slug',
    sort_order: 1,
    created_at: null,
    updated_at: null,
  });
  await assertUniqueConstraint(() =>
    insertFixture(db, 'categories', {
      id: 'c2',
      parent_id: null,
      name: 'C2',
      description: null,
      slug: 'cat-slug',
      sort_order: 2,
      created_at: null,
      updated_at: null,
    })
  );
});

test('translations composite uniqueness is APP-LEVEL (no DB constraint) — duplicate triple does NOT throw at DB layer', async () => {
  // Per Option 1 (decisions.md 2026-06-24): astro:db cannot declare a table-level
  // composite UNIQUE, so the (entity_type, entity_id, locale) uniqueness is enforced
  // by the translation upsert accessor, NOT by the DB. This test documents that fact:
  // a direct duplicate insert at the DB layer does NOT throw (the accessor is the
  // guard). If this test ever fails, someone added a DB-level composite unique that
  // looks like it works in the harness (schema.ts) but is silently ignored in prod
  // (config.ts/astro:db) — a false-confidence trap.
  const { db } = env;
  await insertFixture(db, 'translations', {
    id: 't1',
    entity_type: 'product',
    entity_id: 'x',
    locale: 'ro',
    name: 'A',
    description: null,
    slug: null,
    label: null,
  });
  // Different locale/entity_type succeed (these would pass even with a real constraint)
  await insertFixture(db, 'translations', {
    id: 't2',
    entity_type: 'product',
    entity_id: 'x',
    locale: 'en',
    name: 'A-en',
    description: null,
    slug: null,
    label: null,
  });
  await insertFixture(db, 'translations', {
    id: 't3',
    entity_type: 'variant',
    entity_id: 'x',
    locale: 'ro',
    name: 'V',
    description: null,
    slug: null,
    label: null,
  });
  // The SAME triple does NOT throw at the DB layer (no constraint) — accessor is the guard
  await insertFixture(db, 'translations', {
    id: 't4',
    entity_type: 'product',
    entity_id: 'x',
    locale: 'ro',
    name: 'A-dup',
    description: null,
    slug: null,
    label: null,
  });
  const rows = await db.select().from(translations);
  const dups = rows.filter(
    (r) => r.entity_type === 'product' && r.entity_id === 'x' && r.locale === 'ro'
  );
  assert.strictEqual(
    dups.length,
    2,
    'DB layer allows duplicate translation triple; accessor must guard'
  );
});
