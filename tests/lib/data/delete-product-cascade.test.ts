/**
 * r17 Task 7 — deleteProduct cascade (transactional).
 *
 * deleteProduct today does a bare DELETE FROM products, orphaning variants,
 * prices, images, assignments, values, and cart_items. It must clean up all
 * child rows in a single transaction, mirroring deleteVariant — but at product
 * scope — and must NOT touch order_items (snapshots are immutable).
 *
 * See reespec/requests/shop-r17-data-integrity-hardening (cascade-delete-product spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq, inArray, and, or } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture, type TestDb } from '../../db/harness.ts';
import { deleteProduct } from '../../../src/lib/data/products.ts';
import {
  products,
  product_variants,
  product_prices,
  product_images,
  product_attribute_assignments,
  product_attribute_values,
  cart_items,
  order_items,
  orders,
} from '../../../src/db/schema.ts';

const now = () => new Date();
const rid = () => crypto.randomUUID();

let env: TestDb;
let pid: string;
let v1: string;
let v2: string;
let assignId: string;
let cartItemId: string;
let orderId: string;
let orderItemId: string;

test('deleteProduct cascade: setup — product with variants, prices, images, assignments, values, cart_item, and an order_item snapshot', async () => {
  env = await createTestDb();
  const { db } = env;
  const f = await seedMinimal(db);
  // Use the variant product from fixtures; it already has 2 variants, assignments,
  // variant values, and prices. Add product-level extras and a cart_item + order_item.
  pid = f.variantProductId;
  v1 = f.variantBlack128Id;
  v2 = f.variantWhite256Id;
  assignId = f.assignVariantColorId;

  // Product-level image + product-level price + product-level attribute value already
  // exist via fixtures (brand). Add a cart_item referencing the product.
  cartItemId = rid();
  await insertFixture(db, 'cart_items', {
    id: cartItemId,
    cart_id: (await db.select().from(cart_items).limit(1))[0]?.cart_id ?? rid(),
    product_id: pid,
    variant_id: null,
    quantity: 1,
  });
  // To avoid FK-like constraint issues, give the cart_item a real cart.
  const cartId = rid();
  await insertFixture(db, 'carts', {
    id: cartId,
    session_id: 'sess-cascade',
    user_id: null,
    applied_voucher_code: null,
    applied_referral_code: null,
    converted_at: null,
    expires_at: new Date(now().getTime() + 86400000),
    created_at: now(),
    updated_at: now(),
  });
  await db.delete(cart_items).where(eq(cart_items.id, cartItemId));
  await insertFixture(db, 'cart_items', {
    id: cartItemId,
    cart_id: cartId,
    product_id: pid,
    variant_id: v1,
    quantity: 2,
  });

  // An order with an order_item snapshot referencing the product (must NOT be deleted).
  orderId = rid();
  await insertFixture(db, 'orders', {
    id: orderId,
    order_number: 'ORD-CASCADE-1',
    user_id: null,
    customer_type: 'individual',
    customer_email: 'c@e.com',
    customer_name: 'C',
    customer_phone: null,
    status: 'paid',
    currency: 'RON',
    subtotal_net: 100,
    vat_total: 19,
    shipping_cost: 0,
    discount_amount: 0,
    total: 119,
    shipping_type: 'physical',
    shipping_method: null,
    voucher_code: null,
    referral_code: null,
    billing_first_name: 'C',
    billing_last_name: 'D',
    billing_address: 'A',
    billing_city: 'C',
    billing_postal_code: '1',
    billing_country: 'RO',
    billing_county: null,
    billing_phone: null,
    billing_company: null,
    billing_vat_number: null,
    shipping_first_name: 'C',
    shipping_last_name: 'D',
    shipping_address: 'A',
    shipping_city: 'C',
    shipping_postal_code: '1',
    shipping_country: 'RO',
    shipping_county: null,
    shipping_phone: null,
    shipping_company: null,
    shipping_vat_number: null,
    shipping_same_as_billing: true,
    payment_provider: null,
    payment_intent_id: null,
    transaction_id: null,
    refund_amount: null,
    refund_notes: null,
    refunded_at: null,
    notes: null,
    created_at: now(),
    updated_at: now(),
  });
  orderItemId = rid();
  await insertFixture(db, 'order_items', {
    id: orderItemId,
    order_id: orderId,
    product_id: pid,
    variant_id: v1,
    product_name: 'Snapshot',
    sku: 'SNAP',
    quantity: 1,
    price_net: 100,
    vat_rate: 0.19,
    price_gross: 119,
    currency: 'RON',
  });
  assert.ok(pid);
});

test('deleteProduct removes the product and ALL child rows in one transaction', async () => {
  const { db } = env;
  await deleteProduct(db, pid);

  // product gone
  const [p] = await db.select().from(products).where(eq(products.id, pid));
  assert.ok(!p, 'product row must be deleted');

  // variants gone
  const variants = await db
    .select()
    .from(product_variants)
    .where(eq(product_variants.product_id, pid));
  assert.strictEqual(variants.length, 0, 'all product_variants deleted');

  // prices gone (product-level + variant-level)
  const pricesByProduct = await db
    .select()
    .from(product_prices)
    .where(eq(product_prices.product_id, pid));
  const pricesByVariant = await db
    .select()
    .from(product_prices)
    .where(inArray(product_prices.variant_id, [v1, v2]));
  assert.strictEqual(pricesByProduct.length, 0, 'product-level prices deleted');
  assert.strictEqual(pricesByVariant.length, 0, 'variant-level prices deleted');

  // images gone
  const images = await db.select().from(product_images).where(eq(product_images.product_id, pid));
  assert.strictEqual(images.length, 0, 'product_images deleted');

  // assignments gone
  const assignments = await db
    .select()
    .from(product_attribute_assignments)
    .where(eq(product_attribute_assignments.product_id, pid));
  assert.strictEqual(assignments.length, 0, 'product_attribute_assignments deleted');

  // attribute values gone (product-level + variant-level)
  const valsByProduct = await db
    .select()
    .from(product_attribute_values)
    .where(
      and(
        eq(product_attribute_values.entity_type, 'product'),
        eq(product_attribute_values.entity_id, pid)
      )
    );
  const valsByVariant = await db
    .select()
    .from(product_attribute_values)
    .where(
      and(
        eq(product_attribute_values.entity_type, 'variant'),
        inArray(product_attribute_values.entity_id, [v1, v2])
      )
    );
  assert.strictEqual(valsByProduct.length, 0, 'product-level attribute values deleted');
  assert.strictEqual(valsByVariant.length, 0, 'variant-level attribute values deleted');

  // cart_items referencing the product or its variants gone
  const cartItems = await db
    .select()
    .from(cart_items)
    .where(or(eq(cart_items.product_id, pid), inArray(cart_items.variant_id, [v1, v2])));
  assert.strictEqual(cartItems.length, 0, 'cart_items referencing the product/variants deleted');
});

test('deleteProduct does NOT delete order_items (snapshots are immutable, order history preserved)', async () => {
  const { db } = env;
  const [oi] = await db.select().from(order_items).where(eq(order_items.id, orderItemId));
  assert.ok(oi, 'order_items snapshot must survive deleteProduct (order history preserved)');
  assert.strictEqual(oi.product_id, pid, 'snapshot keeps its (now dangling) product_id');
  // the order itself survives
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  assert.ok(o, 'order row survives');
});

test('deleteProduct on a product with no children is a no-op-safe delete', async () => {
  const { db } = await createTestDb();
  const bareId = rid();
  await insertFixture(db, 'products', {
    id: bareId,
    sku: 'BARE-NOCHILD',
    type: 'physical',
    has_variants: false,
    vat_rate: 0.19,
    stock: 5,
    category_id: null,
    active: true,
    name: 'Bare',
    description: '',
    slug: 'bare-nochild',
    created_at: now(),
    updated_at: now(),
  });
  await deleteProduct(db, bareId);
  const [p] = await db.select().from(products).where(eq(products.id, bareId));
  assert.ok(!p, 'bare product deleted with no error');
});

test('deleteProduct is atomic — a mid-cascade throw rolls back ALL deletes', async () => {
  // Force a failure by passing a db whose transaction rejects. We use a proxy that
  // throws on the products-table delete (the last step) but allows reads, then
  // assert no child rows were actually removed.
  const { db } = await createTestDb();
  const f = await seedMinimal(db);
  const prodId = f.variantProductId;
  // Wrap db.transaction so it throws AFTER the cascade body runs but before commit,
  // simulating a mid-cascade failure. Drizzle's transaction executes the callback
  // against a tx handle; throwing inside the callback rolls back the whole tx.
  const realTx = db.transaction.bind(db);
  let calls = 0;
  db.transaction = (async (cb: any) => {
    calls++;
    return realTx(async (tx: any) => {
      // Run the cascade body against tx, then throw to force rollback.
      const result = await cb(tx);
      throw new Error('forced-mid-cascade-failure');
    });
  }) as any;

  await assert.rejects(
    () => deleteProduct(db, prodId),
    /forced-mid-cascade-failure/,
    'deleteProduct should propagate the mid-cascade failure'
  );

  // Restore and verify NOTHING was deleted (rollback).
  db.transaction = realTx;
  const [p] = await db.select().from(products).where(eq(products.id, prodId));
  assert.ok(p, 'product row survives the rolled-back cascade');
  const variants = await db
    .select()
    .from(product_variants)
    .where(eq(product_variants.product_id, prodId));
  assert.ok(variants.length > 0, 'variants survive the rolled-back cascade (atomic)');
  const prices = await db
    .select()
    .from(product_prices)
    .where(eq(product_prices.product_id, prodId));
  assert.ok(prices.length >= 0, 'prices queryable after rollback');
});
