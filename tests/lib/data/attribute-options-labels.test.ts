import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal } from '../../db/harness.ts';
import { createOption, updateOption } from '../../../src/lib/data/attribute-options.ts';
import { listTranslationsByEntityIds } from '../../../src/lib/data/products.ts';

test('createOption persists default-locale and other-locale label translations', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const opt = await createOption(db, f.attrColorId, {
      value: 'violet',
      sort_order: 3,
      label: 'Violet',
      translations: { en: 'Violet' },
    });
    const rows = await listTranslationsByEntityIds(db, 'product_attribute_option', [opt.id]);
    const ro = rows.find((r) => r.locale === 'ro');
    const en = rows.find((r) => r.locale === 'en');
    assert.ok(ro, 'default-locale label translation must be written');
    assert.strictEqual(ro!.label, 'Violet');
    assert.ok(en, 'en label translation must be written');
    assert.strictEqual(en!.label, 'Violet');
  } finally {
    await cleanup();
  }
});

test('updateOption upserts default-locale and other-locale label translations', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const opt = await createOption(db, f.attrColorId, { value: 'violet', sort_order: 3 });
    await updateOption(db, opt.id, {
      label: 'Mov',
      translations: { en: 'Violet' },
    });
    const rows = await listTranslationsByEntityIds(db, 'product_attribute_option', [opt.id]);
    const ro = rows.find((r) => r.locale === 'ro');
    const en = rows.find((r) => r.locale === 'en');
    assert.ok(ro, 'default-locale label translation must be written on update');
    assert.strictEqual(ro!.label, 'Mov');
    assert.ok(en, 'en label translation must be written on update');
    assert.strictEqual(en!.label, 'Violet');
  } finally {
    await cleanup();
  }
});
