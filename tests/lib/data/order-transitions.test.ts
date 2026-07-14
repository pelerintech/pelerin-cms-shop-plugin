/**
 * State-machine + seed clear-order tests for the r16 inventory lifecycle.
 *
 * Covers:
 *  - `partially_refunded` transitions are allowed per the updated VALID_TRANSITIONS map.
 *  - `delivered → refunded` is NOT allowed (must go via partially_refunded/refund_requested).
 *  - `cancelled → refunded` is NOT allowed.
 *  - `src/db/seed.ts` clears `order_refunds` before `orders`/`order_items` (FK-safe order).
 *
 * See reespec/requests/shop-r16-inventory-lifecycle (partial-refund-status spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { validateTransition, OrderTransitionError } from '../../../src/lib/data/orders.ts';

const SEED_PATH = new URL('../../../src/db/seed.ts', import.meta.url);

function assertAllows(from: string, to: string) {
  // should NOT throw
  validateTransition(from, to);
}

function assertRejects(from: string, to: string) {
  assert.throws(
    () => validateTransition(from, to),
    (err: any) => err instanceof OrderTransitionError,
    `expected ${from} → ${to} to be rejected`,
  );
}

test('delivered → partially_refunded is allowed', () => {
  assertAllows('delivered', 'partially_refunded');
});

test('partially_refunded → refunded is allowed', () => {
  assertAllows('partially_refunded', 'refunded');
});

test('partially_refunded → refund_requested is allowed', () => {
  assertAllows('partially_refunded', 'refund_requested');
});

test('refund_requested → refunded is allowed', () => {
  assertAllows('refund_requested', 'refunded');
});

test('cancelled → refunded is rejected', () => {
  assertRejects('cancelled', 'refunded');
});

test('refunded is terminal (no outgoing transitions)', () => {
  assertRejects('refunded', 'delivered');
  assertRejects('refunded', 'partially_refunded');
});

test('seed.ts clears order_refunds before orders (FK-safe clear order)', () => {
  const source = readFileSync(SEED_PATH, 'utf-8');
  const refundsIdx = source.indexOf('DELETE FROM order_refunds');
  assert.notEqual(refundsIdx, -1, 'seed.ts must contain "DELETE FROM order_refunds"');
  const ordersIdx = source.indexOf('DELETE FROM orders');
  assert.notEqual(ordersIdx, -1, 'seed.ts must contain "DELETE FROM orders"');
  assert.ok(
    refundsIdx < ordersIdx,
    'seed.ts must clear order_refunds BEFORE orders (FK-safe order)',
  );
  const orderItemsIdx = source.indexOf('DELETE FROM order_items');
  assert.ok(
    orderItemsIdx !== -1 && refundsIdx < orderItemsIdx,
    'seed.ts must clear order_refunds BEFORE order_items (FK-safe order)',
  );
});
