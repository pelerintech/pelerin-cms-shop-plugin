/**
 * Task 43 — Admin order detail page: Create Payment button, transitions map, refund modal.
 *
 * The page source must contain:
 * - A "Create Payment" button (visible for pending/awaiting_payment orders)
 * - The client-side transitions map includes 'pending' in awaiting_payment
 * - The refund modal sends { refunds: [...] } format (NOT { refund_amount, refund_notes })
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, '../../src/pages/admin/orders/[id].astro');

function getPageSource(): string {
  return fs.readFileSync(PAGE_PATH, 'utf-8');
}

test('has Create Payment button', () => {
  const source = getPageSource();
  assert.match(source, /Create Payment/i, 'should have Create Payment button or logic');
});

test('transitions map includes pending in awaiting_payment', () => {
  const source = getPageSource();
  // Check that the transitions object includes 'pending' for awaiting_payment
  assert.match(source, /awaiting_payment.*pending/, 'awaiting_payment transitions should include pending');
});

test('refund modal sends { refunds: [...] } format', () => {
  const source = getPageSource();
  // The refund modal should use the new { refunds: [...] } format
  assert.match(source, /refunds[\s\S]*order_item_id/, 'should use refunds array with order_item_id');
  // Should NOT send the old { refund_amount, refund_notes } in the API body
  assert.doesNotMatch(source, /JSON\.stringify[\s\S]*refund_amount/, 'should not use old refund_amount in API body');
});
