import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal } from '../../db/harness.ts';
import {
  createOption,
  updateOption,
  OptionError,
} from '../../../src/lib/data/attribute-options.ts';

test('createOption rejects a duplicate value within the same attribute', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await assert.rejects(
      () => createOption(db, f.attrColorId, { value: 'black', sort_order: 0 }),
      (err: any) => err instanceof OptionError && err.code === 'duplicate_value'
    );
  } finally {
    await cleanup();
  }
});

test('createOption allows the same value on a different attribute', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // 'black' is a color option; it is fine as a storage option value.
    const opt = await createOption(db, f.attrStorageId, { value: 'black', sort_order: 9 });
    assert.ok(opt.id);
  } finally {
    await cleanup();
  }
});

test('updateOption rejects changing an option to a sibling value', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await assert.rejects(
      () => updateOption(db, f.optColorWhiteId, { value: 'black' }),
      (err: any) => err instanceof OptionError && err.code === 'duplicate_value'
    );
  } finally {
    await cleanup();
  }
});

test('updateOption allows setting an option to its own current value', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const updated = await updateOption(db, f.optColorBlackId, { value: 'black' });
    assert.strictEqual(updated.value, 'black');
  } finally {
    await cleanup();
  }
});
