import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { resolveOptionValueLabels } from '../../../src/lib/data/attribute-value.ts';

test('resolveOptionValueLabels returns the canonical value and the localized label', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const map = await resolveOptionValueLabels(db, [f.optColorBlackId, f.optColorWhiteId], 'en');
    assert.strictEqual(map.get(f.optColorBlackId)?.value, 'black', 'canonical value');
    assert.strictEqual(map.get(f.optColorBlackId)?.label, 'Black', 'localized label');
    assert.strictEqual(map.get(f.optColorWhiteId)?.value, 'white');
    assert.strictEqual(map.get(f.optColorWhiteId)?.label, 'White');
  } finally {
    await cleanup();
  }
});

test('resolveOptionValueLabels is locale-scoped (ro vs en labels differ)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const ro = await resolveOptionValueLabels(db, [f.optColorBlackId], 'ro');
    const en = await resolveOptionValueLabels(db, [f.optColorBlackId], 'en');
    assert.strictEqual(ro.get(f.optColorBlackId)?.label, 'Negru');
    assert.strictEqual(en.get(f.optColorBlackId)?.label, 'Black');
    assert.strictEqual(ro.get(f.optColorBlackId)?.value, 'black');
  } finally {
    await cleanup();
  }
});

test('resolveOptionValueLabels falls back to the canonical value when no label translation exists', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // A brand-new option with no translation for any locale.
    const optId = 'opt-no-trans';
    await insertFixture(db, 'product_attribute_options', {
      id: optId,
      attribute_id: f.attrColorId,
      value: 'refurbished',
      sort_order: 3,
    });
    const map = await resolveOptionValueLabels(db, [optId], 'ro');
    assert.strictEqual(map.get(optId)?.value, 'refurbished');
    assert.strictEqual(map.get(optId)?.label, 'refurbished', 'label falls back to value');
  } finally {
    await cleanup();
  }
});

test('resolveOptionValueLabels returns an empty map for empty or unknown ids', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const empty = await resolveOptionValueLabels(db, [], 'en');
    assert.strictEqual(empty.size, 0);
    const unknown = await resolveOptionValueLabels(db, ['does-not-exist'], 'en');
    assert.strictEqual(unknown.size, 0);
  } finally {
    await cleanup();
  }
});
