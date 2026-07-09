/**
 * r17 Task 6 — PUT /products/:id/translations/:locale Zod (path params win).
 *
 * The PUT handler currently does `upsertTranslation(db, { entity_type:'product',
 * entity_id: ctx.params.id, locale: ctx.params.locale, ...body })` — a body
 * containing `entity_id`/`entity_type`/`locale` overrides the path params (hijack)
 * and writes a translation for a DIFFERENT entity. After the fix: body is parsed
 * with UpsertProductTranslationSchema (ONLY content fields name/description/slug/
 * label); path params always win; empty body → 422.
 *
 * See reespec/requests/shop-r17-data-integrity-hardening (endpoint-zod-schemas spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { createTestDb, seedMinimal } from '../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../helpers.ts';
import { translations } from '../../../../db/harness.ts';
import { eq } from 'drizzle-orm';

ensureLoader();
const { runPut } = await import(
  '../../../../../src/api/shop/products/[id]/translations/[locale].ts'
);

const URL = (id: string, locale: string) =>
  `http://localhost/api/plugins/shop/products/${id}/translations/${locale}`;

test('PUT happy-path → 200, writes translation for the path-param product', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId, 'de'),
      body: { name: 'Buch', description: 'Ein Buch', slug: 'buch', label: 'Buch' },
      method: 'PUT',
      params: { id: f.simpleProductId, locale: 'de' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    const rows = await db.select().from(translations).where(eq(translations.entity_id, f.simpleProductId));
    const de = rows.find(t => t.entity_type === 'product' && t.locale === 'de');
    assert.ok(de, 'de translation written for the path-param product');
    assert.equal(de.name, 'Buch');
  } finally {
    await cleanup();
  }
});

test('PUT path-param wins: body entity_id/entity_type/locale ignored (no hijack)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // Body tries to hijack to a different product id / entity_type / locale.
    const ctx = makeCtx({
      url: URL(f.simpleProductId, 'de'),
      body: { name: 'Hijack', entity_id: 'different-product-id', entity_type: 'variant', locale: 'fr' },
      method: 'PUT',
      params: { id: f.simpleProductId, locale: 'de' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    // The translation must be written for the PATH product (de), NOT the body's
    // different-product-id (fr) — no hijack.
    const deRows = await db.select().from(translations).where(eq(translations.entity_id, f.simpleProductId));
    const de = deRows.find(t => t.entity_type === 'product' && t.locale === 'de');
    assert.ok(de, 'translation written for the PATH-param product+locale');
    assert.equal(de.name, 'Hijack');
    const hijackRows = await db.select().from(translations).where(eq(translations.entity_id, 'different-product-id'));
    assert.equal(hijackRows.length, 0, 'body entity_id must NOT hijack the write target');
  } finally {
    await cleanup();
  }
});

test('PUT validation-fail → 422 on empty body (at least one content field required)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId, 'de'),
      body: {},
      method: 'PUT',
      params: { id: f.simpleProductId, locale: 'de' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Validation failed');
    assert.ok(b.fields && Object.keys(b.fields).length > 0);
  } finally {
    await cleanup();
  }
});

test('PUT: body cannot inject entity_id to write a different entity', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId, 'es'),
      body: { name: 'Hola', entity_id: f.variantProductId },
      method: 'PUT',
      params: { id: f.simpleProductId, locale: 'es' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    // Written for PATH product, NOT the variant product the body tried to set.
    const variantRows = await db.select().from(translations).where(eq(translations.entity_id, f.variantProductId));
    const esOnVariant = variantRows.find(t => t.locale === 'es');
    assert.ok(!esOnVariant, 'body entity_id must not redirect the write to the variant');
  } finally {
    await cleanup();
  }
});

test('PUT auth-fail → 401', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk({ authThrows: { status: 401, message: 'Unauthorized' } });
    const ctx = makeCtx({
      url: URL('x', 'en'),
      body: { name: 'x' },
      method: 'PUT',
      params: { id: 'x', locale: 'en' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 401);
  } finally {
    await cleanup();
  }
});
