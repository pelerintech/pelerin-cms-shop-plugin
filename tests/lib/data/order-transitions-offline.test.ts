/**
 * Tests for method-aware (Ramburs-gated) offline order status transitions.
 *
 * Covers the three new transitions:
 *   pending → processing  (ramburs only)
 *   shipped → paid        (ramburs only)
 *   delivered → paid      (ramburs only)
 *
 * And ensures online/bank-transfer orders are still rejected for these,
 * while existing transitions remain unchanged.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../stubs/register.mjs';
import { createTestDb, seedMinimal, buildOrderRow, orders, order_status_history } from '../../db/harness.ts';
import { eq } from 'drizzle-orm';
import {
  validateTransition,
  transitionOrderStatus,
  OrderTransitionError,
} from '../../../src/lib/data/orders.ts';

ensureLoader();
// Import providers to register them
await import('../../../src/providers/payment/stripe');
await import('../../../src/providers/payment/euplatesc');
await import('../../../src/providers/payment/bank_transfer');
await import('../../../src/providers/payment/ramburs');

async function createOrder(db: any, overrides: Record<string, any> = {}) {
  const row = buildOrderRow(overrides);
  await db.insert(orders).values(row);
  return row;
}

// ── pending → processing ──

test('pending → processing succeeds for ramburs', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'pending',
      payment_provider: 'ramburs',
    });
    await transitionOrderStatus(db, order.id, 'processing');
    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(updated.status, 'processing');
  } finally {
    await cleanup();
  }
});

test('pending → processing rejected for stripe', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'pending',
      payment_provider: 'stripe',
    });
    await assert.rejects(
      () => transitionOrderStatus(db, order.id, 'processing'),
      OrderTransitionError
    );
  } finally {
    await cleanup();
  }
});

test('pending → processing rejected for bank_transfer', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'pending',
      payment_provider: 'bank_transfer',
    });
    await assert.rejects(
      () => transitionOrderStatus(db, order.id, 'processing'),
      OrderTransitionError
    );
  } finally {
    await cleanup();
  }
});

// ── shipped → paid ──

test('shipped → paid succeeds for ramburs', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'shipped',
      payment_provider: 'ramburs',
    });
    await transitionOrderStatus(db, order.id, 'paid');
    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(updated.status, 'paid');
  } finally {
    await cleanup();
  }
});

test('shipped → paid rejected for stripe', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'shipped',
      payment_provider: 'stripe',
    });
    await assert.rejects(() => transitionOrderStatus(db, order.id, 'paid'), OrderTransitionError);
  } finally {
    await cleanup();
  }
});

// ── delivered → paid ──

test('delivered → paid succeeds for ramburs', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'delivered',
      payment_provider: 'ramburs',
    });
    await transitionOrderStatus(db, order.id, 'paid');
    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(updated.status, 'paid');
  } finally {
    await cleanup();
  }
});

test('delivered → paid rejected for bank_transfer', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'delivered',
      payment_provider: 'bank_transfer',
    });
    await assert.rejects(() => transitionOrderStatus(db, order.id, 'paid'), OrderTransitionError);
  } finally {
    await cleanup();
  }
});

test('delivered → paid rejected for stripe', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'delivered',
      payment_provider: 'stripe',
    });
    await assert.rejects(() => transitionOrderStatus(db, order.id, 'paid'), OrderTransitionError);
  } finally {
    await cleanup();
  }
});

// ── Regression: existing transitions unchanged ──

test('ramburs delivered → refund_requested still works (existing transition)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'delivered',
      payment_provider: 'ramburs',
    });
    await transitionOrderStatus(db, order.id, 'refund_requested');
    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(updated.status, 'refund_requested');
  } finally {
    await cleanup();
  }
});

test('stripe awaiting_payment → paid still works (existing path)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'awaiting_payment',
      payment_provider: 'stripe',
    });
    await transitionOrderStatus(db, order.id, 'paid');
    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(updated.status, 'paid');
  } finally {
    await cleanup();
  }
});

// ── Full Ramburs lifecycle: chained pending→processing→shipped→delivered→paid ──

test('full ramburs lifecycle chain produces four history rows', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'pending',
      payment_provider: 'ramburs',
      id: 'lifecycle-test-order-1',
    });

    // Step 1: pending → processing
    await transitionOrderStatus(db, order.id, 'processing');
    let updated = await db.select().from(orders).where(eq(orders.id, order.id)).then(r => r[0]);
    assert.equal(updated.status, 'processing');

    // Step 2: processing → shipped
    await transitionOrderStatus(db, order.id, 'shipped');
    updated = await db.select().from(orders).where(eq(orders.id, order.id)).then(r => r[0]);
    assert.equal(updated.status, 'shipped');

    // Step 3: shipped → delivered
    await transitionOrderStatus(db, order.id, 'delivered');
    updated = await db.select().from(orders).where(eq(orders.id, order.id)).then(r => r[0]);
    assert.equal(updated.status, 'delivered');

    // Step 4: delivered → paid
    await transitionOrderStatus(db, order.id, 'paid');
    updated = await db.select().from(orders).where(eq(orders.id, order.id)).then(r => r[0]);
    assert.equal(updated.status, 'paid');

    // Assert four history rows were created
    const history = await db
      .select()
      .from(order_status_history)
      .where(eq(order_status_history.order_id, order.id))
      .orderBy(order_status_history.created_at);
    assert.equal(history.length, 4, 'expected 4 order_status_history rows for the full lifecycle');
    assert.equal(history[0].from_status, 'pending');
    assert.equal(history[0].to_status, 'processing');
    assert.equal(history[1].from_status, 'processing');
    assert.equal(history[1].to_status, 'shipped');
    assert.equal(history[2].from_status, 'shipped');
    assert.equal(history[2].to_status, 'delivered');
    assert.equal(history[3].from_status, 'delivered');
    assert.equal(history[3].to_status, 'paid');
  } finally {
    await cleanup();
  }
});

// ── Defensive: null provider ──

test('pending → processing rejected for null payment_provider', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const order = await createOrder(db, {
      status: 'pending',
      payment_provider: null,
    });
    await assert.rejects(
      () => transitionOrderStatus(db, order.id, 'processing'),
      OrderTransitionError
    );
  } finally {
    await cleanup();
  }
});
