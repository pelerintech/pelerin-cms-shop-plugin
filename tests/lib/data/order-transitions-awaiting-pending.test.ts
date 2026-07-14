import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createTestDb, resetDb, orders, buildOrderRow } from '../../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { transitionOrderStatus } from '../../../src/lib/data/orders.ts';

describe('order transitions — awaiting_payment → pending', () => {
  let db: LibSQLDatabase;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
  });

  it('allows awaiting_payment → pending transition', async () => {
    const orderRow = buildOrderRow({
      id: 'order-1',
      order_number: 'ORD-001',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
    });
    await db.insert(orders).values(orderRow);

    // Must not throw
    await transitionOrderStatus(db, 'order-1', 'pending', 'Admin reset to pending');

    // Verify status changed
    const { eq } = await import('drizzle-orm');
    const result = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, 'order-1')).limit(1);
    assert.strictEqual(result[0].status, 'pending',
      'Order must transition from awaiting_payment to pending');
  });
});
