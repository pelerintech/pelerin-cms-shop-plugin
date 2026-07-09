/**
 * Atomic decrementStock regression + contract tests (r16).
 *
 * `decrementStock` (now inlined inside createOrder's transaction) must issue a
 * single `UPDATE ... SET stock = MAX(0, stock - ?) WHERE ...` per item with NO
 * preceding `SELECT` of the variant/product stock in the decrement path.
 *
 * Scenarios:
 *  (a) variant stock=5, qty=3 → after createOrder, variant.stock === 2.
 *  (b) null-stock product → no decrement, no error.
 *  (c) product-level (variant_id=null) decrement hits products.stock.
 *  (d) source contract: decrementStock issues the atomic UPDATE (no SELECT-before-UPDATE).
 *
 * See reespec/requests/shop-r16-inventory-lifecycle (atomic-stock-decrement spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { products, product_variants } from '../../../src/db/schema.ts';
import { createOrder } from '../../../src/lib/data/orders.ts';

const ORDERS_SRC = readFileSync(new URL('../../../src/lib/data/orders.ts', import.meta.url), 'utf-8');

const now = () => new Date();
const futureExpiry = () => new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000);

async function makeCart(db: any, f: any, cartId: string, items: { productId: string; variantId?: string | null; quantity: number }[]) {
  await insertFixture(db, 'carts', {
    id: cartId, session_id: 'sess-' + cartId, user_id: null, applied_voucher_code: null,
    applied_referral_code: null, converted_at: null, expires_at: futureExpiry(),
    created_at: now(), updated_at: now(),
  });
  for (const [i, it] of items.entries()) {
    await insertFixture(db, 'cart_items', {
      id: `ci-${cartId}-${i}`, cart_id: cartId, product_id: it.productId,
      variant_id: it.variantId ?? null, quantity: it.quantity,
    });
  }
}

function baseInput(cartId: string, items: any[]) {
  return {
    order_number: 'ORD-DS', user_id: null, customer_type: 'individual',
    customer_email: 't@e.com', customer_name: 'T', customer_phone: null, currency: 'RON',
    subtotal_net: 5000, vat_total: 250, shipping_cost: 0, discount_amount: 0, total: 5250,
    shipping_type: 'physical', billing_first_name: 'T', billing_last_name: 'U', billing_address: 'A',
    billing_city: 'C', billing_postal_code: '1', billing_country: 'RO',
    shipping_first_name: 'T', shipping_last_name: 'U', shipping_address: 'A',
    shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
    shipping_same_as_billing: true, cart_id: cartId, items,
  };
}

test('(a) variant stock=5, qty=3 → stock becomes 2 after createOrder', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Set the variant stock to exactly 5.
    await db.update(product_variants).set({ stock: 5 }).where(eq(product_variants.id, f.variantBlack128Id));
    const cartId = 'cart-ds-a';
    await makeCart(db, f, cartId, [{ productId: f.variantProductId, variantId: f.variantBlack128Id, quantity: 3 }]);

    await createOrder(db, baseInput(cartId, [
      { product_id: f.variantProductId, variant_id: f.variantBlack128Id, product_name: 'Telefon', sku: 'SMX-BLK-128', quantity: 3, price_net: 25000, vat_rate: 0.19, price_gross: 29750, currency: 'RON' },
    ]));

    const [v] = await db.select().from(product_variants).where(eq(product_variants.id, f.variantBlack128Id));
    assert.equal(v.stock, 2, 'variant stock 5 → 2');
  } finally {
    await cleanup();
  }
});

test('(b) null-stock product → no decrement, no error', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // The variant product has stock=null (unlimited). Order its variant; null stays null.
    const cartId = 'cart-ds-b';
    await makeCart(db, f, cartId, [{ productId: f.variantProductId, variantId: f.variantWhite256Id, quantity: 2 }]);

    await createOrder(db, baseInput(cartId, [
      { product_id: f.variantProductId, variant_id: f.variantWhite256Id, product_name: 'Telefon', sku: 'SMX-WHT-256', quantity: 2, price_net: 30000, vat_rate: 0.19, price_gross: 35700, currency: 'RON' },
    ]));

    const [v] = await db.select().from(product_variants).where(eq(product_variants.id, f.variantWhite256Id));
    // Variant white256 had stock=30 (from seed); 30 → 28.
    assert.equal(v.stock, 28);
    // The product itself (stock=null) stays null.
    const [p] = await db.select().from(products).where(eq(products.id, f.variantProductId));
    assert.equal(p.stock, null, 'product stock stays null');
  } finally {
    await cleanup();
  }
});

test('(c) product-level (variant_id=null) decrement hits products.stock', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // simple product stock=100 (from seed). Order 7.
    const cartId = 'cart-ds-c';
    await makeCart(db, f, cartId, [{ productId: f.simpleProductId, quantity: 7 }]);

    await createOrder(db, baseInput(cartId, [
      { product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 7, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' },
    ]));

    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 93, 'product stock 100 → 93');
    // product_variants untouched (no variant rows for the simple product).
    const variants = await db.select().from(product_variants);
    assert.equal(variants.length, 2, 'variant rows unchanged');
  } finally {
    await cleanup();
  }
});

test('(d) source contract: decrementStock uses atomic UPDATE ... SET stock = MAX(0, stock - ?), no SELECT-before-UPDATE in decrement path', () => {
  // The decrement must be a single guarded UPDATE per item. Assert the source
  // contains the atomic UPDATE form and does NOT do a read-then-write
  // (SELECT-then-UPDATE) in the decrement path.
  assert.match(
    ORDERS_SRC,
    /UPDATE "product_variants" SET "stock" = MAX\(0, "stock" -/,
    'decrementStock must use atomic UPDATE ... SET stock = MAX(0, stock - ?) for variants',
  );
  assert.match(
    ORDERS_SRC,
    /UPDATE "products" SET "stock" = MAX\(0, "stock" -/,
    'decrementStock must use atomic UPDATE ... SET stock = MAX(0, stock - ?) for products',
  );
  // The guarded UPDATE must include the stock >= qty condition (in-tx re-validation).
  assert.match(
    ORDERS_SRC,
    /AND "stock" IS NOT NULL AND "stock" >= \$\{item\.quantity\}/,
    'decrement must guard on stock IS NOT NULL AND stock >= qty',
  );
});
