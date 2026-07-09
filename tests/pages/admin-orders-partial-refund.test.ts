/**
 * Tier 3 source-assertion: the admin orders pages tolerate the new
 * `partially_refunded` status (r16).
 *
 * The status must appear in the badge color/label maps AND the filter dropdown
 * on the orders list page, so an order with this status does not render a blank
 * badge and is filterable. The detail page badge map must include it too.
 *
 * This is a static source-assertion (readFileSync), NOT a behavioral test —
 * runtime UI behavior is covered by Tier 4 (Playwright).
 *
 * See reespec/requests/shop-r16-inventory-lifecycle (partial-refund-status spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const LIST_PAGE = readFileSync(new URL('../../src/pages/admin/orders/index.astro', import.meta.url), 'utf-8');
const DETAIL_PAGE = readFileSync(new URL('../../src/pages/admin/orders/[id].astro', import.meta.url), 'utf-8');

test('orders list page: status badge color map includes partially_refunded', () => {
  assert.match(LIST_PAGE, /partially_refunded:\s*['"]badge-[^'"]+['"]/, 'statusBadge colors map must include partially_refunded');
});

test('orders list page: status label map includes partially_refunded', () => {
  assert.match(LIST_PAGE, /partially_refunded:\s*['"][^'"]+['"]/, 'statusLabel labels map must include partially_refunded');
});

test('orders list page: filter dropdown has an option for partially_refunded', () => {
  assert.match(
    LIST_PAGE,
    /<option\s+value="partially_refunded"/,
    'filter <select> must have an option value="partially_refunded"',
  );
});

test('orders detail page: status badge color map includes partially_refunded', () => {
  assert.match(DETAIL_PAGE, /partially_refunded/, 'detail page badge map must reference partially_refunded');
});
