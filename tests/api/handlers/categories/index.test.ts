import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../_matrix.ts';
import { insertFixture } from '../../../db/harness.ts';
import { translations } from '../../../db/harness.ts';
import { eq, and } from 'drizzle-orm';

ensureLoader();
const { runGet, runPost } = await import('../../../../src/api/shop/categories/index.ts');

const url = 'http://localhost/api/plugins/shop/categories';

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url }));

test('GET happy-path → 200, data is array', () =>
  matrix.happyPath({
    run: runGet,
    url,
    expectedStatus: 200,
    check: (b) => assert.ok(Array.isArray(b.data), 'data should be an array'),
  }));

test('GET error-wrap → 500', () => matrix.errorWrap({ run: runGet, url }));

test('POST auth-fail → 401', () => matrix.adminAuthFail({ run: runPost, url, body: {} }));

test('POST validation-fail: missing required fields → 422', () =>
  matrix.validationFail({
    run: runPost,
    url,
    invalidBody: { sort_order: 1 },
  }));

test('POST happy-path: valid body → 201, data.id exists', () =>
  matrix.happyPath({
    run: runPost,
    url,
    body: { name: 'New Cat', slug: 'new-cat-uniq', sort_order: 10 },
    method: 'POST',
    expectedStatus: 201,
    check: (b) => assert.ok(b.data?.id, 'data.id should exist'),
  }));

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url,
    body: { name: 'ErrCat', slug: 'err-cat', sort_order: 1 },
  }));

test('POST without locale fields → 201, no translation rows created', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url,
      body: { name: 'Plain Cat', slug: 'plain-cat-uniq', sort_order: 20 },
      method: 'POST',
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(b.data?.id, 'data.id should exist');

    // Verify NO translation rows were created
    const transRows = await db
      .select()
      .from(translations)
      .where(and(eq(translations.entity_id, b.data.id), eq(translations.entity_type, 'category')));
    assert.equal(
      transRows.length,
      0,
      'No translation rows should exist when no locale fields sent'
    );
  } finally {
    await cleanup();
  }
});

test('POST with translation fields → 201, translation row created', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    // seedMinimal has 'ro' as default locale, so 'en' is the non-default (known) locale
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url,
      body: {
        name: 'New Cat',
        slug: 'new-cat-trans',
        sort_order: 10,
        name_en: 'New Cat EN',
        slug_en: 'new-cat-en',
        description_en: 'Description in English',
      },
      method: 'POST',
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(b.data?.id, 'data.id should exist');

    // Verify translation row was created
    const transRows = await db
      .select()
      .from(translations)
      .where(and(eq(translations.entity_id, b.data.id), eq(translations.entity_type, 'category')));
    const enTrans = transRows.find((t) => t.locale === 'en');
    assert.ok(enTrans, 'EN translation should exist');
    assert.equal(enTrans.name, 'New Cat EN');
    assert.equal(enTrans.slug, 'new-cat-en');
    assert.equal(enTrans.description, 'Description in English');
  } finally {
    await cleanup();
  }
});

test('GET with search param filters categories by name/slug', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);

    // Insert a category with a distinctive name for searching
    await insertFixture(db, 'categories', {
      id: 'cat-electronics',
      parent_id: null,
      name: 'Electronics',
      slug: 'electronics',
      description: null,
      sort_order: 50,
      created_at: new Date(),
      updated_at: null,
    });

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: 'http://localhost/api/plugins/shop/categories?search=elec',
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be an array');

    // All returned categories should match "elec" in name or slug
    const allMatch = b.data.every(
      (c: any) => c.name.toLowerCase().includes('elec') || c.slug.toLowerCase().includes('elec')
    );
    assert.ok(allMatch, 'all returned categories should match search term');
    assert.ok(b.data.length > 0, 'should return at least one matching category');
    assert.ok(
      b.data.some((c: any) => c.name === 'Electronics'),
      'should include Electronics'
    );
  } finally {
    await cleanup();
  }
});
