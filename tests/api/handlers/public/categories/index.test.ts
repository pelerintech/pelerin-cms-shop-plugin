import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, assert, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../../_matrix.ts';
import { categories, translations as harnessTranslations } from '../../../../db/harness.ts';

ensureLoader();
const { runGet } = await import('../../../../../src/api/shop/public/categories/index.ts');

const BASE = 'http://localhost/api/plugins/shop/public/categories';

test('GET happy-path → 200, data is array', () =>
  matrix.happyPath({
    run: runGet,
    url: BASE + '?locale=ro',
    check: (b) => assert.ok(Array.isArray(b.data), 'data should be an array'),
  }));

test('GET error-wrap → 500', () => matrix.errorWrap({ run: runGet, url: BASE + '?locale=ro' }));

// ── Slug resolution scenarios ──

test('GET categories ?slug=books&locale=en → 200, single object with localized name/description', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${BASE}?slug=books&locale=en` });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(!Array.isArray(b.data), 'data should be a single object, not array');
    assert.equal(b.data.id, f.categoryBooksId);
    assert.equal(b.data.slug, 'books');
    assert.equal(b.data.name, 'Books', 'name should be localized from translation');
    assert.equal(b.data.description, 'Specialty books', 'description should be localized from translation');
  } finally {
    await cleanup();
  }
});

test('GET categories ?slug=carti&locale=en → 200, fallback to default slug', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${BASE}?slug=carti&locale=en` });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(!Array.isArray(b.data), 'data should be a single object');
  } finally {
    await cleanup();
  }
});

test('GET categories ?slug=nope&locale=en → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${BASE}?slug=nope&locale=en` });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET categories ?slug=books&locale=en → 409 on collision', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert a second category with the same en slug 'books'.
    const secondCatId = crypto.randomUUID();
    await db.insert(categories).values({
      id: secondCatId, parent_id: null, name: 'Second', description: null,
      slug: 'second-' + secondCatId.slice(0, 8), sort_order: 99, created_at: null, updated_at: null,
    });
    await db.insert(harnessTranslations).values({
      id: crypto.randomUUID(), entity_type: 'category', entity_id: secondCatId,
      locale: 'en', name: 'Second', description: null, slug: 'books', label: null,
    });
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${BASE}?slug=books&locale=en` });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 409);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET categories (no slug) still returns array with localized slug', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${BASE}?locale=en` });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be an array');
    const books = b.data.find((c: any) => c.id === f.categoryBooksId);
    assert.ok(books);
    assert.equal(books.slug, 'books', 'books category should have localized slug');
  } finally {
    await cleanup();
  }
});
