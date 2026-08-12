/**
 * Tier 1 tests for the shared discount-evaluation module
 * (`src/lib/cart-discount.ts`).
 *
 * `evaluateCartDiscount(db, cart, items, currency)` is the single source of
 * truth for voucher + referral validity and discount math, used by both
 * GET /cart and checkout. These tests exercise the full cart-structure matrix
 * against the real-SQLite harness.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, insertFixture } from '../db/harness.ts';
import { evaluateCartDiscount } from '../../src/lib/cart-discount.ts';

const rid = () => crypto.randomUUID();
const now = new Date();

/** Build an enriched item line with the given subtotal (single line, no VAT). */
function item(subtotal: number): any[] {
  return [
    {
      id: rid(),
      product_id: 'prod-1',
      variant_id: null,
      product_name: 'Product',
      sku: 'P1',
      quantity: 1,
      price_net: subtotal,
      vat_rate: null,
      currency: 'RON',
      attributes: [],
    },
  ];
}

async function insertVoucher(db: any, overrides: Record<string, any> = {}): Promise<void> {
  await insertFixture(db, 'vouchers', {
    id: rid(),
    code: 'PCT20',
    type: 'percentage',
    value: 20,
    min_order_value: null,
    max_uses: null,
    uses_count: 0,
    valid_from: null,
    valid_until: null,
    single_use_per_customer: false,
    active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  });
}

async function insertReferral(db: any, overrides: Record<string, any> = {}): Promise<void> {
  await insertFixture(db, 'referral_codes', {
    id: rid(),
    code: 'PARTNER10',
    name: 'Partner',
    discount_type: 'percentage',
    discount_value: 10,
    active: true,
    notes: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  });
}

// ── Voucher status ──

test('V1: valid voucher → status valid, percentage discount computed', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db);
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: null },
      item(100),
      'RON'
    );
    assert.equal(res.voucher?.status, 'valid');
    assert.equal(res.voucher?.discount_amount, 20);
    assert.equal(res.discount_amount, 20);
  } finally {
    await cleanup();
  }
});

test('V2: subtotal below min_order_value → min_order_not_met, discount 0', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db, { min_order_value: 200 });
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: null },
      item(150),
      'RON'
    );
    assert.equal(res.voucher?.status, 'min_order_not_met');
    assert.equal(res.voucher?.discount_amount, 0);
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('V3: expired voucher → expired, discount 0', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db, { valid_until: new Date(Date.now() - 60_000) });
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: null },
      item(100),
      'RON'
    );
    assert.equal(res.voucher?.status, 'expired');
    assert.equal(res.voucher?.discount_amount, 0);
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('V4: usage cap reached → usage_exceeded, discount 0', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db, { max_uses: 5, uses_count: 5 });
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: null },
      item(100),
      'RON'
    );
    assert.equal(res.voucher?.status, 'usage_exceeded');
    assert.equal(res.voucher?.discount_amount, 0);
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('V5: inactive voucher → inactive, discount 0', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db, { active: false });
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: null },
      item(100),
      'RON'
    );
    assert.equal(res.voucher?.status, 'inactive');
    assert.equal(res.voucher?.discount_amount, 0);
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('V5b: missing voucher → inactive, discount 0', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'NOSUCH', applied_referral_code: null },
      item(100),
      'RON'
    );
    assert.equal(res.voucher?.status, 'inactive');
    assert.equal(res.voucher?.code, 'NOSUCH');
    assert.equal(res.voucher?.discount_amount, 0);
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('V6: not-yet-valid voucher folds to inactive', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db, { valid_from: new Date(Date.now() + 60_000) });
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: null },
      item(100),
      'RON'
    );
    assert.equal(res.voucher?.status, 'inactive');
    assert.equal(res.voucher?.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('V7: fixed_amount capped by subtotal', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db, { type: 'fixed_amount', value: 30 });
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: null },
      item(20),
      'RON'
    );
    assert.equal(res.voucher?.status, 'valid');
    assert.equal(res.voucher?.discount_amount, 20);
    assert.equal(res.discount_amount, 20);
  } finally {
    await cleanup();
  }
});

test('V8: percentage discount rounded to two decimals', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db);
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: null },
      item(123.45),
      'RON'
    );
    // Math.round(123.45 * 20 / 100 * 100) / 100 = 24.69
    assert.equal(res.voucher?.discount_amount, 24.69);
  } finally {
    await cleanup();
  }
});

// ── Referral status ──

test('R1: active referral with discount → valid, discount computed', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertReferral(db);
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: null, applied_referral_code: 'PARTNER10' },
      item(500),
      'RON'
    );
    assert.equal(res.referral?.status, 'valid');
    assert.equal(res.referral?.discount_amount, 50);
    assert.equal(res.discount_amount, 50);
  } finally {
    await cleanup();
  }
});

test('R2: inactive referral → inactive, discount 0', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertReferral(db, { active: false });
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: null, applied_referral_code: 'PARTNER10' },
      item(500),
      'RON'
    );
    assert.equal(res.referral?.status, 'inactive');
    assert.equal(res.referral?.discount_amount, 0);
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('R3: tracking-only active referral → valid but discount 0', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertReferral(db, { discount_type: null, discount_value: null });
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: null, applied_referral_code: 'PARTNER10' },
      item(500),
      'RON'
    );
    assert.equal(res.referral?.status, 'valid');
    assert.equal(res.referral?.discount_amount, 0);
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('R4: both applied → referral superseded, voucher wins', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db);
    await insertReferral(db);
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: 'PARTNER10' },
      item(500),
      'RON'
    );
    assert.equal(res.referral?.status, 'superseded_by_voucher');
    assert.equal(res.referral?.discount_amount, 0);
    assert.equal(res.voucher?.status, 'valid');
    assert.equal(res.voucher?.discount_amount, 100);
    assert.equal(res.discount_amount, 100);
  } finally {
    await cleanup();
  }
});

// ── Precedence and totals ──

test('P1: voucher wins when both valid — discounts never combine', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db);
    await insertReferral(db);
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: 'PARTNER10' },
      item(500),
      'RON'
    );
    // voucher 20% of 500 = 100; referral would be 50 but is superseded
    assert.equal(res.discount_amount, 100);
  } finally {
    await cleanup();
  }
});

test('P2: nothing applied → voucher/referral null, discount 0', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: null, applied_referral_code: null },
      item(500),
      'RON'
    );
    assert.equal(res.voucher, null);
    assert.equal(res.referral, null);
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('P3: empty cart never discounts', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db);
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: null },
      [],
      'RON'
    );
    assert.equal(res.voucher?.status, 'valid');
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});

test('P4: invalid voucher keeps referral superseded (presence-based)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await insertVoucher(db, { active: false });
    await insertReferral(db);
    const res = await evaluateCartDiscount(
      db,
      { applied_voucher_code: 'PCT20', applied_referral_code: 'PARTNER10' },
      item(500),
      'RON'
    );
    assert.equal(res.voucher?.status, 'inactive');
    assert.equal(res.referral?.status, 'superseded_by_voucher');
    assert.equal(res.discount_amount, 0);
  } finally {
    await cleanup();
  }
});
