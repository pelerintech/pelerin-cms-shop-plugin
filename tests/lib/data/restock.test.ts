/**
 * restockOrderItems accessor — full + line-item modes (r16).
 *
 * (a) Full mode — restockOrderItems(db, orderId) restocks ALL line items.
 * (b) Line-item mode — restockOrderItems(db, orderId, [{order_item_id, quantity}]) restocks only those units.
 * (c) Null-stock item — skipped, no error.
 * (d) Bad order_item_id — throws RestockError.
 *
 * See reespec/requests/shop-r16-inventory-lifecycle (restock-on-cancel spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { products, product_variants, orders, order_items } from '../../../src/db/schema.ts';
import { createOrder, restockOrderItems, RestockError } from '../../../src/lib/data/orders.ts';

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

async function seedDeliveredOrder(db: any, f: any, orderNumber: string, cartId: string, items: any[]) {
  await makeCart(db, f, cartId, items.map(it => ({ productId: it.product_id, variantId: it.variant_id, quantity: it.quantity })));
  const order = await createOrder(db, {
    order_number: orderNumber, user_id: null, customer_type: 'individual',
    customer_email: 't@e.com', customer_name: 'T', customer_phone: null, currency: 'RON',
    subtotal_net: 5000, vat_total: 250, shipping_cost: 0, discount_amount: 0, total: 5250,
    shipping_type: 'physical', billing_first_name: 'T', billing_last_name: 'U', billing_address: 'A',
    billing_city: 'C', billing_postal_code: '1', billing_country: 'RO',
    shipping_first_name: 'T', shipping_last_name: 'U', shipping_address: 'A',
    shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
    shipping_same_as_billing: true, cart_id: cartId, items,
  });
  // Force to delivered for restock scenarios (restock is status-agnostic at the accessor level).
  await db.update(orders).set({ status: 'delivered' }).where(eq(orders.id, order.id));
  return order;
}

test('(a) full mode: restocks all line items by their ordered quantity', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // simple product stock=100, variant black128 stock=50.
    const items = [
      { product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 2, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' },
      { product_id: f.variantProductId, variant_id: f.variantBlack128Id, product_name: 'Telefon', sku: 'SMX-BLK-128', quantity: 3, price_net: 25000, vat_rate: 0.19, price_gross: 29750, currency: 'RON' },
    ];
    const order = await seedDeliveredOrder(db, f, 'ORD-RA', 'cart-rs-a', items);

    // After createOrder: simple 100→98, variant 50→47.
    const [pBefore] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    const [vBefore] = await db.select().from(product_variants).where(eq(product_variants.id, f.variantBlack128Id));
    assert.equal(pBefore.stock, 98);
    assert.equal(vBefore.stock, 47);

    await restockOrderItems(db, order.id);

    // Full restock: simple 98→100, variant 47→50.
    const [pAfter] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    const [vAfter] = await db.select().from(product_variants).where(eq(product_variants.id, f.variantBlack128Id));
    assert.equal(pAfter.stock, 100, 'simple product fully restocked');
    assert.equal(vAfter.stock, 50, 'variant fully restocked');

    // order_items unchanged (snapshots preserved).
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    assert.equal(oi.length, 2, 'order_items unchanged');
  } finally {
    await cleanup();
  }
});

test('(b) line-item mode: restocks only the specified item/quantity', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const items = [
      { product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 2, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' },
      { product_id: f.variantProductId, variant_id: f.variantBlack128Id, product_name: 'Telefon', sku: 'SMX-BLK-128', quantity: 3, price_net: 25000, vat_rate: 0.19, price_gross: 29750, currency: 'RON' },
    ];
    const order = await seedDeliveredOrder(db, f, 'ORD-RB', 'cart-rs-b', items);
    // After createOrder: simple 100→98, variant 50→47.

    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const simpleItem = oi.find(i => i.product_id === f.simpleProductId);

    // Restock only 1 unit of the simple product item.
    await restockOrderItems(db, order.id, [{ order_item_id: simpleItem.id, quantity: 1 }]);

    const [pAfter] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    const [vAfter] = await db.select().from(product_variants).where(eq(product_variants.id, f.variantBlack128Id));
    assert.equal(pAfter.stock, 99, 'simple product +1 only (98→99)');
    assert.equal(vAfter.stock, 47, 'variant untouched');
  } finally {
    await cleanup();
  }
});

test('(c) null-stock item is skipped, no error', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Variant white256 has stock=30; the variant PRODUCT has stock=null.
    // Order the variant (which has stock) and verify full restock works; the
    // product-level null stock is not touched (variant_id path).
    const items = [
      { product_id: f.variantProductId, variant_id: f.variantWhite256Id, product_name: 'Telefon', sku: 'SMX-WHT-256', quantity: 2, price_net: 30000, vat_rate: 0.19, price_gross: 35700, currency: 'RON' },
    ];
    const order = await seedDeliveredOrder(db, f, 'ORD-RC', 'cart-rs-c', items);
    // variant 30 → 28.

    await restockOrderItems(db, order.id);

    const [vAfter] = await db.select().from(product_variants).where(eq(product_variants.id, f.variantWhite256Id));
    assert.equal(vAfter.stock, 30, 'variant restocked 28→30');
    // product stock stays null (never decremented, never restocked).
    const [pAfter] = await db.select().from(products).where(eq(products.id, f.variantProductId));
    assert.equal(pAfter.stock, null, 'product null stock untouched');
  } finally {
    await cleanup();
  }
});

test('(d) bad order_item_id → throws RestockError', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const items = [
      { product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 2, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' },
    ];
    const order = await seedDeliveredOrder(db, f, 'ORD-RD', 'cart-rs-d', items);

    await assert.rejects(
      () => restockOrderItems(db, order.id, [{ order_item_id: 'nonexistent-item-id', quantity: 1 }]),
      (err: any) => err instanceof RestockError,
    );

    // No restock occurred.
    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 98, 'no restock for bad order_item_id');
  } finally {
    await cleanup();
  }
});
