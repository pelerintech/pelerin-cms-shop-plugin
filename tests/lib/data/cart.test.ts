import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture } from '../../db/harness.ts';
import {
  getCartWithItems,
  getCartById,
  addCartItem,
  updateCartItem,
  deleteCartItem,
  clearCart,
} from '../../../src/lib/data/cart.ts';
import {
  carts,
  products,
  product_variants,
  product_prices,
  translations,
} from '../../../src/db/schema.ts';
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

// ── New: empty-cart cleanup clears applied codes (shop-r35) ──

/** Create a cart with applied voucher + referral codes and n items. */
async function makeCartWithCodesAndItems(
  db: any,
  f: any,
  n: number,
  id = 'cart-codes'
): Promise<{ cartId: string; itemIds: string[] }> {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await insertFixture(db, 'carts', {
    id,
    session_id: 'sess-' + id,
    user_id: null,
    applied_voucher_code: 'PCT20',
    applied_referral_code: 'PARTNER10',
    converted_at: null,
    expires_at: expires,
    created_at: now,
    updated_at: now,
  });
  const itemIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const itemId = `${id}-item-${i}`;
    await insertFixture(db, 'cart_items', {
      id: itemId,
      cart_id: id,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });
    itemIds.push(itemId);
  }
  return { cartId: id, itemIds };
}

test('deleteCartItem clears applied codes when it removes the LAST item', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { cartId, itemIds } = await makeCartWithCodesAndItems(db, f, 1);

    await deleteCartItem(db, cartId, itemIds[0]);

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_voucher_code, null, 'voucher code should be cleared');
    assert.equal(cart.applied_referral_code, null, 'referral code should be cleared');
  } finally {
    await cleanup();
  }
});

test('deleteCartItem keeps applied codes when items remain', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { cartId, itemIds } = await makeCartWithCodesAndItems(db, f, 2);

    await deleteCartItem(db, cartId, itemIds[0]);

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_voucher_code, 'PCT20', 'voucher code should remain');
    assert.equal(cart.applied_referral_code, 'PARTNER10', 'referral code should remain');
  } finally {
    await cleanup();
  }
});

test('clearCart clears applied voucher and referral codes', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { cartId } = await makeCartWithCodesAndItems(db, f, 2);

    await clearCart(db, cartId);

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_voucher_code, null, 'voucher code should be cleared');
    assert.equal(cart.applied_referral_code, null, 'referral code should be cleared');
  } finally {
    await cleanup();
  }
});

test('updateCartItem with quantity 0 clears applied codes when it removes the LAST item', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { cartId, itemIds } = await makeCartWithCodesAndItems(db, f, 1);

    await updateCartItem(db, cartId, itemIds[0], 0);

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_voucher_code, null, 'voucher code should be cleared');
    assert.equal(cart.applied_referral_code, null, 'referral code should be cleared');
  } finally {
    await cleanup();
  }
});

test('updateCartItem with quantity 0 keeps applied codes when items remain', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { cartId, itemIds } = await makeCartWithCodesAndItems(db, f, 2);

    await updateCartItem(db, cartId, itemIds[0], 0);

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_voucher_code, 'PCT20', 'voucher code should remain');
    assert.equal(cart.applied_referral_code, 'PARTNER10', 'referral code should remain');
  } finally {
    await cleanup();
  }
});

// ---------- Variant price fallback to base product (shop-r36) ----------

/** Insert a variant product with an optional base (product-level) RON price and
 *  an optional variant-level RON price. Returns the product + variant ids. */
async function seedVariantWithPrices(
  db: any,
  f: any,
  opts: { baseRon?: number; variantRon?: number | null } = {}
): Promise<{ productId: string; variantId: string }> {
  const productId = crypto.randomUUID();
  const variantId = crypto.randomUUID();
  const now = new Date();
  await insertFixture(db, 'products', {
    id: productId,
    sku: null,
    type: 'physical',
    has_variants: true,
    vat_rate: 0.19,
    stock: null,
    category_id: f.categoryPhonesId,
    active: true,
    name: 'VP2-' + productId,
    description: null,
    slug: 'vp2-' + productId,
    created_at: now,
    updated_at: now,
  });
  await insertFixture(db, 'product_variants', {
    id: variantId,
    product_id: productId,
    sku: 'V2-' + variantId,
    stock: 10,
    active: true,
  });
  if (opts.baseRon !== undefined) {
    await insertFixture(db, 'product_prices', {
      id: crypto.randomUUID(),
      product_id: productId,
      variant_id: null,
      currency: 'RON',
      price_net: opts.baseRon,
    });
  }
  if (opts.variantRon !== undefined && opts.variantRon !== null) {
    await insertFixture(db, 'product_prices', {
      id: crypto.randomUUID(),
      product_id: null,
      variant_id: variantId,
      currency: 'RON',
      price_net: opts.variantRon,
    });
  }
  return { productId, variantId };
}

test('variant line falls back to the base product price when the variant has no price (shop-r36 C2)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db, 'r36-c2');
    const { productId, variantId } = await seedVariantWithPrices(db, f, { baseRon: 900 });
    await addCartItem(db, cartId, { product_id: productId, variant_id: variantId, quantity: 1 });

    const result = await getCartWithItems(db, cartId, 'RON');
    assert.ok(result, 'must return a result');
    assert.strictEqual(result!.items.length, 1);
    assert.strictEqual(
      result!.items[0].price_net,
      900,
      'variant with no own price must inherit the base product price (was 0)'
    );
  } finally {
    await cleanup();
  }
});

test('variant own price wins over the base product price (shop-r36 C1)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db, 'r36-c1');
    const { productId, variantId } = await seedVariantWithPrices(db, f, {
      baseRon: 900,
      variantRon: 1200,
    });
    await addCartItem(db, cartId, { product_id: productId, variant_id: variantId, quantity: 1 });

    const result = await getCartWithItems(db, cartId, 'RON');
    assert.ok(result, 'must return a result');
    assert.strictEqual(result!.items.length, 1);
    assert.strictEqual(
      result!.items[0].price_net,
      1200,
      'variant with an own price keeps its own price (base ignored)'
    );
  } finally {
    await cleanup();
  }
});

test('non-variant line prices from the base product (shop-r36 C3)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db, 'r36-c3');
    await addCartItem(db, cartId, { product_id: f.simpleProductId, variant_id: null, quantity: 1 });

    const result = await getCartWithItems(db, cartId, 'RON');
    assert.ok(result, 'must return a result');
    assert.strictEqual(result!.items.length, 1);
    assert.strictEqual(
      result!.items[0].price_net,
      5000,
      'non-variant line uses base product price'
    );
  } finally {
    await cleanup();
  }
});

test('variant with no price on variant or product stays 0 (shop-r36 C4)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCart(db, 'r36-c4');
    const { productId, variantId } = await seedVariantWithPrices(db, f, {});
    await addCartItem(db, cartId, { product_id: productId, variant_id: variantId, quantity: 1 });

    const result = await getCartWithItems(db, cartId, 'RON');
    assert.ok(result, 'must return a result');
    assert.strictEqual(result!.items.length, 1);
    assert.strictEqual(result!.items[0].price_net, 0, 'no price defined at either level stays 0');
  } finally {
    await cleanup();
  }
});

test('cart variant items expose the unified attribute shape (attribute_id, option_id, canonical value, option_label)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Seed a default-locale (ro) attribute-name translation so we can assert the
    // cart builder resolves the translated name rather than the default column.
    await db.insert(translations).values({
      id: crypto.randomUUID(),
      entity_type: 'product_attribute',
      entity_id: f.attrColorId,
      locale: 'ro',
      name: 'Culoare RO',
      description: null,
      slug: null,
      label: null,
    });
    const cartId = await makeCart(db);
    await addCartItem(db, cartId, {
      product_id: f.variantProductId,
      variant_id: f.variantBlack128Id,
      quantity: 1,
    });

    const result = await getCartWithItems(db, cartId, 'RON');
    const item = result!.items.find((i) => i.variant_id === f.variantBlack128Id);
    assert.ok(item, 'variant cart item present');
    assert.ok(Array.isArray(item!.attributes));
    assert.strictEqual(item!.attributes.length, 2, 'cart item has color + storage dims');

    const color = item!.attributes.find((a) => a.attribute_id === f.attrColorId);
    assert.ok(color, 'color attribute present');
    assert.strictEqual(color.attribute_id, f.attrColorId, 'attribute_id present');
    assert.strictEqual(
      color.attribute_name,
      'Culoare RO',
      'attribute_name resolves the default-locale translation'
    );
    assert.strictEqual(color.value, 'black', 'canonical value (not a UUID)');
    assert.strictEqual(color.option_id, f.optColorBlackId, 'option_id present');
    assert.strictEqual(color.option_label, 'Negru', 'option_label resolves in the default locale');
  } finally {
    await cleanup();
  }
});

test('cart totals stay in MINOR units (no /100 at the API boundary)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const { computeCartTotals } = await import('../../../src/lib/cart-totals.ts');
    // 5000 minor = 50.00 RON; totals must be minor, NOT divided by 100.
    const totals = computeCartTotals(
      [
        {
          id: 'i1',
          product_id: 'p',
          variant_id: null,
          product_name: 'x',
          sku: 'SKU',
          quantity: 1,
          price_net: 5000,
          vat_rate: 0.05,
          currency: 'RON',
          attributes: [],
        },
      ],
      'RON',
      0,
      0
    );
    assert.strictEqual(totals.subtotal_net, 5000, 'subtotal minor');
    assert.strictEqual(totals.total, 5250, 'total minor (no /100)');
  } finally {
    await cleanup();
  }
});
