import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, assert, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../../_matrix.ts';
import {
  categories,
  insertFixture,
  translations as harnessTranslations,
} from '../../../../db/harness.ts';

ensureLoader();
const { runGet } = await import('../../../../../src/api/shop/public/products/index.ts');

const BASE = 'http://localhost/api/plugins/shop/public/products';

function buildUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${BASE}?${qs}`;
}

test('GET happy-path → 200, data is array', () =>
  matrix.happyPath({
    run: runGet,
    url: buildUrl({ currency: 'RON', locale: 'ro' }),
    check: (b) => assert.ok(Array.isArray(b.data), 'data should be an array'),
  }));

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: buildUrl({ currency: 'RON', locale: 'ro' }) }));

// ── Slug resolution scenarios ──

// ── Pagination scenarios ──

test('GET with ?page=1&limit=5 returns paginated response with total, page, limit', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: buildUrl({ page: '1', limit: '5', currency: 'RON', locale: 'ro' }),
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.page, 1, 'page should be 1');
    assert.equal(b.limit, 5, 'limit should be 5');
    assert.equal(typeof b.total, 'number', 'total should be a number');
    assert.ok(b.total > 0, 'total should be > 0');
    assert.ok(Array.isArray(b.data), 'data should be an array');
    assert.ok(b.data.length <= 5, 'data should have at most 5 items');
  } finally {
    await cleanup();
  }
});

test('GET with ?limit=999 caps at 100', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: buildUrl({ limit: '999', currency: 'RON', locale: 'ro' }),
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.limit, 100, 'limit should be capped at 100');
  } finally {
    await cleanup();
  }
});

test('GET with ?page=2&limit=1 returns second page', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: buildUrl({ page: '2', limit: '1', currency: 'RON', locale: 'ro' }),
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.page, 2);
    assert.equal(b.limit, 1);
    assert.ok(b.data.length <= 1, 'second page should have at most 1 item');
  } finally {
    await cleanup();
  }
});

test('GET with ?page=0 defaults page to 1', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: buildUrl({ page: '0', currency: 'RON', locale: 'ro' }),
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.page, 1, 'page 0 should default to 1');
  } finally {
    await cleanup();
  }
});

test('GET products ?slug=programming-book&locale=en&currency=RON → 200, single object with localized name/description', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: buildUrl({ slug: 'programming-book', locale: 'en', currency: 'RON' }),
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(!Array.isArray(b.data), 'data should be a single object, not array');
    assert.equal(b.data.id, f.simpleProductId);
    assert.equal(b.data.slug, 'programming-book');
    assert.equal(b.data.name, 'Programming Book', 'name should be localized from translation');
    assert.equal(
      b.data.description,
      'An excellent book',
      'description should be localized from translation'
    );
    assert.ok(Array.isArray(b.data.images), 'slug response should have images array');
  } finally {
    await cleanup();
  }
});

test('GET products ?slug=nope&locale=en → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: buildUrl({ slug: 'nope', locale: 'en' }) });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET products ?categorySlug=books&locale=en&currency=RON → 200, array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: buildUrl({ categorySlug: 'books', locale: 'en', currency: 'RON' }),
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be an array');
    for (const p of b.data) {
      assert.equal(p.category_id, f.categoryBooksId, `product ${p.id} should be in books category`);
    }
  } finally {
    await cleanup();
  }
});

test('GET products ?categorySlug=nope&locale=en → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: buildUrl({ categorySlug: 'nope', locale: 'en' }) });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET products ?categorySlug=books&locale=en → 409 on collision', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert a second category with the same en slug 'books'.
    const secondCatId = crypto.randomUUID();
    await db.insert(categories).values({
      id: secondCatId,
      parent_id: null,
      name: 'Second',
      description: null,
      slug: 'second-' + secondCatId.slice(0, 8),
      sort_order: 99,
      created_at: null,
      updated_at: null,
    });
    await db.insert(harnessTranslations).values({
      id: crypto.randomUUID(),
      entity_type: 'category',
      entity_id: secondCatId,
      locale: 'en',
      name: 'Second',
      description: null,
      slug: 'books',
      label: null,
    });
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: buildUrl({ categorySlug: 'books', locale: 'en' }) });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 409);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET products ?categoryId= books &categorySlug=nope → 200, categoryId wins', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: buildUrl({ categoryId: f.categoryBooksId, categorySlug: 'nope', locale: 'en' }),
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be an array');
    for (const p of b.data) {
      assert.equal(p.category_id, f.categoryBooksId);
    }
  } finally {
    await cleanup();
  }
});
