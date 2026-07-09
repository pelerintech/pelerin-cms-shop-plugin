/**
 * r17 Task 11 — CSV export escaping + consistent content-type.
 *
 * `orders/export.ts` must escape formula-injection chars (`=`,`+`,`-`,`@`,`\t`,
 * `\r`) by prepending a single quote, double internal double-quotes (RFC 4180),
 * and return `Content-Type: text/csv` on BOTH success and error (so a CSV client
 * always gets CSV).
 *
 * See reespec/requests/shop-r17-data-integrity-hardening (csv-export-hardening spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { makeFakeSdk, makeCtx, poisonDb } from './helpers.ts';
import { createTestDb, seedMinimal, insertFixture } from '../db/harness.ts';
import { escapeCsvCell } from '../../src/lib/csv.ts';
import { createOrder } from '../../src/lib/data/orders.ts';

ensureLoader();
const { runGet } = await import('../../src/api/shop/orders/export.ts');

const base = 'http://localhost/api/plugins/shop/orders/export';

// ── escapeCsvCell unit tests (Tier 3) ──

test('escapeCsvCell prepends a single quote to formula-injection-leading cells', () => {
  assert.strictEqual(escapeCsvCell('=CMD("x")'), `'=CMD(""x"")`, '= → prefixed, quotes doubled');
  assert.strictEqual(escapeCsvCell('+foo'), `'+foo`, '+ → prefixed');
  assert.strictEqual(escapeCsvCell('-foo'), `'-foo`, '- → prefixed');
  assert.strictEqual(escapeCsvCell('@foo'), `'@foo`, '@ → prefixed');
  assert.strictEqual(escapeCsvCell('\tfoo'), `'\tfoo`, 'tab → prefixed');
  assert.strictEqual(escapeCsvCell('\rfoo'), `'\rfoo`, 'CR → prefixed');
});

test('escapeCsvCell RFC 4180 quoting for cells with double-quotes (no formula prefix)', () => {
  assert.strictEqual(escapeCsvCell('John "Doc" Smith'), `"John ""Doc"" Smith"`, 'quotes doubled + wrapped');
  // A cell with a comma is wrapped in quotes
  assert.strictEqual(escapeCsvCell('a,b'), `"a,b"`);
});

test('escapeCsvCell leaves simple cells unquoted', () => {
  assert.strictEqual(escapeCsvCell('ORD-2026-00001'), 'ORD-2026-00001');
  assert.strictEqual(escapeCsvCell('paid'), 'paid');
  assert.strictEqual(escapeCsvCell('5250'), '5250');
});

test('escapeCsvCell handles a formula payload that also contains quotes', () => {
  // =-prefixed AND contains quotes → prefix + doubled quotes (no extra wrapping needed
  // because the leading quote makes it safe, but internal quotes must still be doubled).
  const out = escapeCsvCell('=HYPERLINK("http://evil","x")');
  assert.ok(out.startsWith("'="), 'leading = is prefixed with a single quote');
  assert.ok(out.includes('""http://evil""'), 'internal double-quotes doubled');
});

// ── export handler content-type (success + error) ──

async function makeCart(db: any, cartId: string, productId: string) {
  const now = new Date();
  await insertFixture(db, 'carts', {
    id: cartId, session_id: 'sess-' + cartId, user_id: null, applied_voucher_code: null,
    applied_referral_code: null, converted_at: null, expires_at: new Date(now.getTime() + 30 * 86400000),
    created_at: now, updated_at: now,
  });
  await insertFixture(db, 'cart_items', { id: 'ci-' + cartId, cart_id: cartId, product_id: productId, variant_id: null, quantity: 1 });
}

test('export success → Content-Type: text/csv', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await makeCart(db, 'cart-ok', f.simpleProductId);
    await createOrder(db, {
      order_number: 'ORD-OK', user_id: null, customer_type: 'individual', customer_email: 't@e.com',
      customer_name: 'T', customer_phone: null, currency: 'RON', subtotal_net: 5000, vat_total: 250,
      shipping_cost: 0, discount_amount: 0, total: 5250, shipping_type: 'physical',
      billing_first_name: 'T', billing_last_name: 'U', billing_address: 'A', billing_city: 'C',
      billing_postal_code: '1', billing_country: 'RO',
      shipping_first_name: 'T', shipping_last_name: 'U', shipping_address: 'A',
      shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
      shipping_same_as_billing: true, cart_id: 'cart-ok',
      items: [],
    } as any);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'text/csv', 'success must be text/csv');
  } finally {
    await cleanup();
  }
});

test('export error → Content-Type: text/csv (CSV client always gets CSV)', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({ url: base });
  const res = await runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.headers.get('Content-Type'), 'text/csv', 'error path must also return text/csv');
  // The body is CSV (an error row), not JSON.
  const text = await res.text();
  assert.ok(!text.startsWith('{'), 'error body must not be JSON');
});
