import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture } from '../../db/harness.ts';
import {
  getCartWithItems,
  getCartById,
  addCartItem,
  updateCartItem,
  deleteCartItem,
} from '../../../src/lib/data/cart.ts';
import { carts, products, product_variants } from '../../../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function makeCart(db: any, id = 'cart-1'): Promise<string> {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await insertFixture(db, 'carts', {
    id,
    session_id: 'sess-' + id,
    user_id: null,
    applied_voucher_code: null,
    applied_referral_code: null,
    converted_at: null,
    expires_at: expires,
    created_at: now,
    updated_at: now,
  });
  return id;
}

test('getCartById returns the cart for an existing id', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const cartId = await makeCart(db);
    const cart = await getCartById(db, cartId);
    assert.ok(cart, 'must return the cart');
    assert.strictEqual(cart!.id, cartId);
    assert.strictEqual(cart!.session_id, 'sess-cart-1');
  } finally {
    await cleanup();
  }
});

test('getCartById returns null for a nonexistent cart', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const cart = await getCartById(db, 'does-not-exist');
    assert.strictEqual(cart, null, 'must return null for nonexistent cart');
  } finally {
    await cleanup();
  }
});

test('getCartWithItems returns cart + enriched items with product name and price', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db);
    // Add the simple product to the cart
    await insertFixture(db, 'cart_items', {
      id: 'ci-1',
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 2,
    });

    const result = await getCartWithItems(db, cartId, 'RON');
    assert.ok(result, 'must return a result');
    assert.strictEqual(result!.cart.id, cartId);
    assert.ok(Array.isArray(result!.items));
    assert.strictEqual(result!.items.length, 1, 'must have 1 item');
    const item = result!.items[0];
    assert.strictEqual(item.product_name, 'Carte de programare', 'must enrich with product name');
    assert.strictEqual(item.quantity, 2);
    assert.strictEqual(item.price_net, 5000, 'must resolve RON price (5000 from seed)');
    assert.strictEqual(item.sku, 'BOOK-001');
  } finally {
    await cleanup();
  }
});

test('getCartWithItems returns null for a nonexistent cart', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const result = await getCartWithItems(db, 'nope', 'RON');
    assert.strictEqual(result, null);
  } finally {
    await cleanup();
  }
});

test('getCartWithItems on a cart with no items returns empty items array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const cartId = await makeCart(db);
    const result = await getCartWithItems(db, cartId, 'RON');
    assert.ok(result);
    assert.strictEqual(result!.items.length, 0);
  } finally {
    await cleanup();
  }
});

test('getCartWithItems on empty db returns null with no error', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const result = await getCartWithItems(db, 'any', 'RON');
    assert.strictEqual(result, null);
  } finally {
    await cleanup();
  }
});

test('addCartItem inserts a new item', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db);
    const item = await addCartItem(db, cartId, {
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });
    assert.ok(item.id, 'must return the created item id');
    assert.strictEqual(item.quantity, 1);
    // Verify it's in the DB
    const result = await getCartWithItems(db, cartId, 'RON');
    assert.strictEqual(result!.items.length, 1);
  } finally {
    await cleanup();
  }
});

test('addCartItem increments quantity for an existing same product/variant item', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db);
    await addCartItem(db, cartId, { product_id: f.simpleProductId, variant_id: null, quantity: 2 });
    await addCartItem(db, cartId, { product_id: f.simpleProductId, variant_id: null, quantity: 3 });
    const result = await getCartWithItems(db, cartId, 'RON');
    assert.strictEqual(result!.items.length, 1, 'must not duplicate the item');
    assert.strictEqual(result!.items[0].quantity, 5, 'quantity must be summed (2+3)');
  } finally {
    await cleanup();
  }
});

test('addCartItem rejects out-of-stock with a clear error', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db);
    // Set stock to 1 by updating the product — use insertFixture with a fresh low-stock product
    const lowStockId = crypto.randomUUID();
    await insertFixture(db, 'products', {
      id: lowStockId,
      sku: 'LOW-1',
      type: 'physical',
      has_variants: false,
      vat_rate: 0.05,
      stock: 1,
      category_id: null,
      active: true,
      name: 'Low Stock',
      description: null,
      slug: 'low-stock',
      created_at: new Date(),
      updated_at: new Date(),
    });
    await addCartItem(db, cartId, { product_id: lowStockId, variant_id: null, quantity: 1 });
    await assert.rejects(
      () => addCartItem(db, cartId, { product_id: lowStockId, variant_id: null, quantity: 1 }),
      /stock|Insufficient/i
    );
  } finally {
    await cleanup();
  }
});

test('updateCartItem updates quantity', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db);
    const item = await addCartItem(db, cartId, {
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 2,
    });
    await updateCartItem(db, cartId, item.id, 5);
    const result = await getCartWithItems(db, cartId, 'RON');
    assert.strictEqual(result!.items[0].quantity, 5);
  } finally {
    await cleanup();
  }
});

test('updateCartItem with quantity 0 removes the item', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db);
    const item = await addCartItem(db, cartId, {
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 2,
    });
    await updateCartItem(db, cartId, item.id, 0);
    const result = await getCartWithItems(db, cartId, 'RON');
    assert.strictEqual(result!.items.length, 0, 'item must be removed when quantity is 0');
  } finally {
    await cleanup();
  }
});

test('deleteCartItem removes an item', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db);
    const item = await addCartItem(db, cartId, {
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });
    await deleteCartItem(db, cartId, item.id);
    const result = await getCartWithItems(db, cartId, 'RON');
    assert.strictEqual(result!.items.length, 0);
  } finally {
    await cleanup();
  }
});

test('addCartItem requires a variant when the product has actual variant rows, even if the has_variants column is false', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const now = new Date();
    // A product whose has_variants COLUMN lies (false) but which has a real variant row.
    const productId = crypto.randomUUID();
    await insertFixture(db, 'products', {
      id: productId,
      sku: 'P',
      type: 'physical',
      has_variants: false,
      vat_rate: 0.19,
      stock: 10,
      category_id: null,
      active: true,
      name: 'P',
      description: '',
      slug: 'p',
      created_at: now,
      updated_at: now,
    });
    await insertFixture(db, 'product_variants', {
      id: crypto.randomUUID(),
      product_id: productId,
      sku: 'V',
      stock: 5,
      active: true,
    });

    const cartId = await makeCart(db);
    await assert.rejects(
      () => addCartItem(db, cartId, { product_id: productId, variant_id: null, quantity: 1 }),
      (err: any) => err.code === 'variant_required',
      'product with actual variant rows must require a variant_id (column is ignored)'
    );
  } finally {
    await cleanup();
  }
});
