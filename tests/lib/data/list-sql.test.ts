/**
 * r17 Task 9 — list accessors push WHERE/LIMIT/ORDER BY to SQL + date-range fix.
 *
 * The list accessors currently load entire tables into Node memory then
 * filter/paginate in JS. This test verifies the SQL-pushed path returns the
 * correct page/total for the same args, AND the listOrders date-range off-by-one
 * (a date-only `to` must include the whole day).
 *
 * Response shapes are PRESERVED (listOrders → {orders,total,page,limit};
 * listProducts → {products,total,page,limit}; listCarts/listVouchers/listReferrals
 * → arrays). Only the execution path moves to SQL.
 *
 * See reespec/requests/shop-r17-data-integrity-hardening (list-accessors-sql spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { listOrders, createOrder } from '../../../src/lib/data/orders.ts';
import { listProducts } from '../../../src/lib/data/products.ts';
import { listCarts } from '../../../src/lib/data/cart.ts';
import { listVouchers } from '../../../src/lib/data/vouchers.ts';
import { listReferrals } from '../../../src/lib/data/referrals.ts';
import { orders } from '../../../src/db/schema.ts';

const now = () => new Date();
const rid = () => crypto.randomUUID();
const futureExpiry = () => new Date(now().getTime() + 30 * 86400000);

async function makeCart(db: any, f: any, cartId: string, productId: string) {
  await insertFixture(db, 'carts', {
    id: cartId,
    session_id: 'sess-' + cartId,
    user_id: null,
    applied_voucher_code: null,
    applied_referral_code: null,
    converted_at: null,
    expires_at: futureExpiry(),
    created_at: now(),
    updated_at: now(),
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-' + cartId,
    cart_id: cartId,
    product_id: productId,
    variant_id: null,
    quantity: 1,
  });
}

function orderInput(cartId: string, num: string, total = 5250) {
  return {
    order_number: num,
    user_id: null,
    customer_type: 'individual',
    customer_email: 't@e.com',
    customer_name: 'T',
    customer_phone: null,
    currency: 'RON',
    subtotal_net: 5000,
    vat_total: 250,
    shipping_cost: 0,
    discount_amount: 0,
    total,
    shipping_type: 'physical',
    billing_first_name: 'T',
    billing_last_name: 'U',
    billing_address: 'A',
    billing_city: 'C',
    billing_postal_code: '1',
    billing_country: 'RO',
    shipping_first_name: 'T',
    shipping_last_name: 'U',
    shipping_address: 'A',
    shipping_city: 'C',
    shipping_postal_code: '1',
    shipping_country: 'RO',
    shipping_same_as_billing: true,
    cart_id: cartId,
    items: [],
  } as any;
}

// ── listOrders ──

test('listOrders pushes pagination to SQL: page 2 of 3 returns the middle slice, total is correct', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    for (let i = 0; i < 6; i++) {
      const cartId = 'cart-pg-' + i;
      await makeCart(db, f, cartId, f.simpleProductId);
      await createOrder(db, orderInput(cartId, 'ORD-PG-' + i));
    }
    // 6 orders, limit 2 → 3 pages. Page 2 = items 3-4 (DESC).
    const p1 = await listOrders(db, { page: 1, limit: 2 });
    const p2 = await listOrders(db, { page: 2, limit: 2 });
    assert.strictEqual(p1.total, 6, 'total must be the full count (SQL COUNT with same WHERE)');
    assert.strictEqual(p2.total, 6);
    assert.strictEqual(p1.orders.length, 2, 'page 1 has 2');
    assert.strictEqual(p2.orders.length, 2, 'page 2 has 2');
    // No overlap between pages
    const p1Ids = new Set(p1.orders.map((o: any) => o.id));
    const overlap = p2.orders.filter((o: any) => p1Ids.has(o.id));
    assert.strictEqual(overlap.length, 0, 'pages must not overlap (SQL OFFSET working)');
  } finally {
    await cleanup();
  }
});

test('listOrders date-range: date-only `to` includes the whole day (off-by-one fix)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert an order whose created_at is mid-day on 2026-06-24.
    const cartId = 'cart-date';
    await makeCart(db, f, cartId, f.simpleProductId);
    const order = await createOrder(db, orderInput(cartId, 'ORD-DATE-1'));
    // Overwrite created_at to 2026-06-24T15:00:00Z (createOrder sets ~now).
    await db
      .update(orders)
      .set({ created_at: new Date('2026-06-24T15:00:00.000Z') })
      .where(eq(orders.id, order.id));

    // to='2026-06-24' (date-only) must INCLUDE the 15:00 order (treated as 23:59:59.999Z).
    const result = await listOrders(db, { to: '2026-06-24', limit: 50 });
    const found = result.orders.find((o: any) => o.id === order.id);
    assert.ok(
      found,
      'an order created at 2026-06-24T15:00Z must be included when to="2026-06-24" (date-only inclusive)'
    );

    // to='2026-06-23' must EXCLUDE it.
    const before = await listOrders(db, { to: '2026-06-23', limit: 50 });
    const foundBefore = before.orders.find((o: any) => o.id === order.id);
    assert.ok(!foundBefore, 'an order on 2026-06-24 must be excluded when to="2026-06-23"');
  } finally {
    await cleanup();
  }
});

test('listOrders status filter pushes to SQL: only matching statuses returned, total reflects filter', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    for (let i = 0; i < 3; i++) {
      const cartId = 'cart-st-' + i;
      await makeCart(db, f, cartId, f.simpleProductId);
      await createOrder(db, orderInput(cartId, 'ORD-ST-' + i));
    }
    // All seeded orders are 'pending' (createOrder default). Filter by a status
    // that none have → empty page, total 0.
    const none = await listOrders(db, { status: ['delivered'], limit: 50 });
    assert.strictEqual(none.orders.length, 0);
    assert.strictEqual(none.total, 0);
    // Filter by pending → all.
    const pending = await listOrders(db, { status: ['pending'], limit: 50 });
    assert.ok(pending.orders.length >= 3);
    assert.ok(pending.orders.every((o: any) => o.status === 'pending'));
  } finally {
    await cleanup();
  }
});

// ── listProducts ──

test('listProducts pushes pagination + category filter to SQL', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Add several products to the Books category so pagination is exercisable.
    for (let i = 0; i < 4; i++) {
      await insertFixture(db, 'products', {
        id: rid(),
        sku: 'BOOK-EXTRA-' + i,
        type: 'physical',
        has_variants: false,
        vat_rate: 0.05,
        stock: 10,
        category_id: f.categoryBooksId,
        active: true,
        name: 'Book ' + i,
        description: '',
        slug: 'book-extra-' + i,
        created_at: now(),
        updated_at: now(),
      });
    }
    const page1 = await listProducts(db, { page: 1, limit: 2, category_id: f.categoryBooksId });
    const page2 = await listProducts(db, { page: 2, limit: 2, category_id: f.categoryBooksId });
    // Books now has the seeded simple product + 4 extras = 5.
    assert.strictEqual(
      page1.total,
      5,
      'total reflects the category filter (SQL WHERE category_id)'
    );
    assert.strictEqual(page1.products.length, 2);
    assert.strictEqual(page2.products.length, 2);
    // All returned products are in the Books category.
    for (const p of [...page1.products, ...page2.products]) {
      assert.strictEqual(p.category_id, f.categoryBooksId);
    }
    // No overlap.
    const p1Ids = new Set(page1.products.map((p: any) => p.id));
    assert.strictEqual(page2.products.filter((p: any) => p1Ids.has(p.id)).length, 0);
  } finally {
    await cleanup();
  }
});

test('listProducts active filter pushes to SQL', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const active = await listProducts(db, { active: true, limit: 50 });
    const inactive = await listProducts(db, { active: false, limit: 50 });
    assert.ok(active.products.every((p: any) => p.active === true));
    assert.ok(inactive.products.every((p: any) => p.active === false));
  } finally {
    await cleanup();
  }
});

// ── listCarts / listVouchers / listReferrals (array shape preserved; WHERE/ORDER in SQL) ──

test('listCarts pushes userId + abandonedSince filters to SQL (array shape preserved)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Add a cart for a specific user.
    const userId = rid();
    await insertFixture(db, 'carts', {
      id: rid(),
      session_id: 'sess-u',
      user_id: userId,
      applied_voucher_code: null,
      applied_referral_code: null,
      converted_at: null,
      expires_at: futureExpiry(),
      created_at: now(),
      updated_at: now(),
    });
    const userCarts = await listCarts(db, { userId });
    assert.ok(userCarts.length >= 1);
    assert.ok(
      userCarts.every((c: any) => c.user_id === userId),
      'userId filter pushed to SQL'
    );
    // Ordered DESC by updated_at
    for (let i = 1; i < userCarts.length; i++) {
      assert.ok(userCarts[i - 1].updated_at >= userCarts[i].updated_at, 'DESC by updated_at');
    }
  } finally {
    await cleanup();
  }
});

test('listVouchers returns all vouchers DESC by created_at (array shape preserved)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const rows = await listVouchers(db);
    assert.ok(Array.isArray(rows), 'listVouchers preserves its array shape');
    assert.ok(rows.length >= 2);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].created_at >= rows[i].created_at, 'DESC by created_at (SQL ORDER BY)');
    }
  } finally {
    await cleanup();
  }
});

test('listReferrals returns all referrals DESC by created_at (array shape preserved)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const rows = await listReferrals(db);
    assert.ok(Array.isArray(rows), 'listReferrals preserves its array shape');
    assert.ok(rows.length >= 1);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].created_at >= rows[i].created_at, 'DESC by created_at (SQL ORDER BY)');
    }
  } finally {
    await cleanup();
  }
});

// ── r17 list-accessors-sql: paginated mode pushes LIMIT/OFFSET + COUNT to SQL ──
// The spec scenario is "WITH pagination/filter args": when page/limit are passed,
// the accessor must push WHERE/ORDER/LIMIT/OFFSET to SQL and return a separate
// COUNT(*) as `total` — NOT load the whole table and slice in JS. The no-arg
// array shape (above) is preserved for backward compatibility with the admin
// list API endpoints; pagination is opt-in.

async function seedManyVouchers(db: any, n: number) {
  for (let i = 0; i < n; i++) {
    await insertFixture(db, 'vouchers', {
      id: rid(),
      code: 'PAGED-V-' + i,
      type: 'fixed_amount',
      value: 10,
      min_order_value: null,
      max_uses: null,
      uses_count: 0,
      valid_from: null,
      valid_until: null,
      single_use_per_customer: false,
      active: i % 2 === 0,
      created_at: now(),
      updated_at: now(),
    });
  }
}

async function seedManyReferrals(db: any, n: number) {
  for (let i = 0; i < n; i++) {
    await insertFixture(db, 'referral_codes', {
      id: rid(),
      code: 'PAGED-R-' + i,
      name: 'R ' + i,
      discount_type: 'percentage',
      discount_value: 5,
      active: i % 2 === 0,
      notes: null,
      created_at: now(),
      updated_at: now(),
    });
  }
}

test('listVouchers paginated pushes LIMIT/OFFSET + COUNT to SQL (no full-table load)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await seedManyVouchers(db, 5); // + seeded vouchers
    const p1 = await listVouchers(db, { page: 1, limit: 2 });
    const p2 = await listVouchers(db, { page: 2, limit: 2 });
    assert.ok(!Array.isArray(p1), 'paginated mode returns {rows,total,page,limit}, not an array');
    assert.strictEqual((p1 as any).page, 1);
    assert.strictEqual((p1 as any).limit, 2);
    assert.strictEqual((p1 as any).rows.length, 2, 'page 1 has limit rows');
    assert.strictEqual((p2 as any).rows.length, 2, 'page 2 has limit rows');
    assert.strictEqual((p1 as any).total, (p2 as any).total, 'total is the COUNT(*) across pages');
    assert.ok((p1 as any).total >= 5, 'total reflects all matching rows');
    // No overlap between pages (SQL OFFSET working).
    const p1Ids = new Set((p1 as any).rows.map((r: any) => r.id));
    assert.strictEqual(
      (p2 as any).rows.filter((r: any) => p1Ids.has(r.id)).length,
      0,
      'pages must not overlap'
    );
  } finally {
    await cleanup();
  }
});

test('listVouchers paginated active filter pushes WHERE to SQL; total reflects filter', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await seedManyVouchers(db, 6); // 3 active, 3 inactive (i%2===0 → active)
    const active = await listVouchers(db, { page: 1, limit: 50, active: true });
    const inactive = await listVouchers(db, { page: 1, limit: 50, active: false });
    const all = await listVouchers(db, { page: 1, limit: 50 });
    assert.ok(
      (active as any).rows.every((r: any) => r.active === true),
      'active filter pushed to SQL'
    );
    assert.ok(
      (inactive as any).rows.every((r: any) => r.active === false),
      'inactive filter pushed to SQL'
    );
    assert.strictEqual(
      (active as any).total,
      (active as any).rows.length,
      'total matches rows when limit covers all'
    );
    // active + inactive totals must cover every voucher (seeded + inserted).
    assert.strictEqual(
      (active as any).total + (inactive as any).total,
      (all as any).total,
      'active+inactive totals cover all vouchers'
    );
    assert.ok((active as any).total >= 3, 'at least the 3 inserted active vouchers');
    assert.ok((inactive as any).total >= 3, 'at least the 3 inserted inactive vouchers');
  } finally {
    await cleanup();
  }
});

test('listReferrals paginated pushes LIMIT/OFFSET + COUNT to SQL (no full-table load)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await seedManyReferrals(db, 5);
    const p1 = await listReferrals(db, { page: 1, limit: 2 });
    const p2 = await listReferrals(db, { page: 2, limit: 2 });
    assert.ok(!Array.isArray(p1), 'paginated mode returns {rows,total,page,limit}');
    assert.strictEqual((p1 as any).limit, 2);
    assert.strictEqual((p1 as any).rows.length, 2);
    assert.strictEqual((p2 as any).rows.length, 2);
    assert.strictEqual((p1 as any).total, (p2 as any).total);
    assert.ok((p1 as any).total >= 5);
    const p1Ids = new Set((p1 as any).rows.map((r: any) => r.id));
    assert.strictEqual(
      (p2 as any).rows.filter((r: any) => p1Ids.has(r.id)).length,
      0,
      'no overlap'
    );
  } finally {
    await cleanup();
  }
});

test('listReferrals paginated active filter pushes WHERE to SQL; total reflects filter', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await seedManyReferrals(db, 6);
    const active = await listReferrals(db, { page: 1, limit: 50, active: true });
    assert.ok((active as any).rows.every((r: any) => r.active === true));
    assert.strictEqual((active as any).total, (active as any).rows.length);
    assert.ok((active as any).total >= 3);
  } finally {
    await cleanup();
  }
});

test('listCarts paginated pushes LIMIT/OFFSET + COUNT to SQL (no full-table load)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Seed 5 carts for a specific user so the userId filter is exercisable.
    const userId = rid();
    for (let i = 0; i < 5; i++) {
      await insertFixture(db, 'carts', {
        id: rid(),
        session_id: 'sess-' + i,
        user_id: userId,
        applied_voucher_code: null,
        applied_referral_code: null,
        converted_at: null,
        expires_at: futureExpiry(),
        created_at: now(),
        updated_at: now(),
      });
    }
    const p1 = await listCarts(db, { userId, page: 1, limit: 2 });
    const p2 = await listCarts(db, { userId, page: 2, limit: 2 });
    assert.ok(!Array.isArray(p1), 'paginated mode returns {rows,total,page,limit}');
    assert.strictEqual((p1 as any).rows.length, 2);
    assert.strictEqual((p2 as any).rows.length, 2);
    assert.strictEqual((p1 as any).total, 5, 'total is the COUNT(*) with the userId WHERE');
    assert.strictEqual((p2 as any).total, 5);
    assert.ok(
      (p1 as any).rows.every((c: any) => c.user_id === userId),
      'userId filter pushed to SQL'
    );
    const p1Ids = new Set((p1 as any).rows.map((c: any) => c.id));
    assert.strictEqual(
      (p2 as any).rows.filter((c: any) => p1Ids.has(c.id)).length,
      0,
      'no overlap'
    );
  } finally {
    await cleanup();
  }
});
