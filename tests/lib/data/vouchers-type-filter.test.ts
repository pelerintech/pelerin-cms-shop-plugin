import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, insertFixture, vouchers } from '../../db/harness.ts';
import { listVouchers } from '../../../src/lib/data/vouchers.ts';

// seedMinimal adds 2 vouchers (1 percentage, 1 fixed_amount); clear them so counts are deterministic.
async function clearVouchers(db: any): Promise<void> {
  await db.delete(vouchers);
}

/**
 * r38 Task 3 — `listVouchers` server-side `type` filter, composing with
 * pagination so the count stays correct under the filter.
 */

async function seedVouchers(db: any, count: number, type: string): Promise<void> {
  for (let i = 0; i < count; i++) {
    await insertFixture(db, 'vouchers', {
      id: `vou-${type}-${i}`,
      code: `${type.toUpperCase()}-${i}`,
      type,
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
  }
}

test('listVouchers filters by type in SQL with correct count', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await clearVouchers(db);
    await seedVouchers(db, 25, 'percentage');
    await seedVouchers(db, 8, 'fixed_amount');
    const result = await listVouchers(db, { page: 1, limit: 20, type: 'percentage' });
    assert.strictEqual(result.total, 25, 'total should count only percentage');
    assert.strictEqual(result.rows.length, 20);
    for (const v of result.rows) {
      assert.strictEqual(v.type, 'percentage');
    }
  } finally {
    await cleanup();
  }
});

test('listVouchers type filter spans pages correctly', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await clearVouchers(db);
    await seedVouchers(db, 25, 'percentage');
    const result = await listVouchers(db, { page: 2, limit: 20, type: 'percentage' });
    assert.strictEqual(result.total, 25);
    assert.strictEqual(result.rows.length, 5);
    for (const v of result.rows) {
      assert.strictEqual(v.type, 'percentage');
    }
  } finally {
    await cleanup();
  }
});
