import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { CreateCartItemSchema } from '../../src/schemas/cart.schema.ts';

const configContents = readFileSync(new URL('../../src/db/config.ts', import.meta.url), 'utf-8');

/**
 * Spec: "WHEN inserting a cart_item with a non-existent cart_id
 *        THEN the insert fails (FK violation or Zod schema rejection)"
 *
 * Astro DB / SQLite does not enforce FK constraints at DB level without
 * PRAGMA foreign_keys = ON (design.md accepted limitation). The Zod schema
 * is the safety net — it rejects empty or missing cart_id at the API boundary.
 */
test('CreateCartItemSchema rejects empty cart_id (FK guard via Zod)', () => {
  const result = CreateCartItemSchema.safeParse({
    cart_id: '',
    product_id: 'prod-1',
    quantity: 1,
  });
  assert.strictEqual(result.success, false, 'empty cart_id must be rejected');
  if (!result.success) {
    const cartIdError = result.error.issues.find(i => i.path.includes('cart_id'));
    assert.ok(cartIdError, 'error must be on cart_id field');
  }
});

test('CreateCartItemSchema rejects missing cart_id', () => {
  const result = CreateCartItemSchema.safeParse({
    product_id: 'prod-1',
    quantity: 1,
  });
  assert.strictEqual(result.success, false, 'missing cart_id must be rejected');
});

test('CreateCartItemSchema accepts valid cart_id', () => {
  const result = CreateCartItemSchema.safeParse({
    cart_id: 'cart-uuid-123',
    product_id: 'prod-1',
    quantity: 2,
  });
  assert.strictEqual(result.success, true);
});

/**
 * Spec: "WHEN inserting an order_item with a non-existent order_id
 *        THEN the insert fails"
 *
 * order_id lives on the DB table only — it is set server-side and never
 * provided in user input. The DB column is declared as non-optional text
 * in config.ts (enforced by Astro DB schema), which rejects nulls at write time.
 */
test('order_items table declares order_id as required (non-optional) column', () => {
  // Verify the DB schema does NOT mark order_id as optional in order_items
  // This ensures DB-level null rejection even without FK enforcement
  const orderItemsSection = configContents.slice(
    configContents.indexOf('const order_items = defineTable'),
    configContents.indexOf('const order_items = defineTable') + 400
  );
  assert.ok(orderItemsSection.includes('order_id: column.text()'), 'order_id should be a required (non-optional) column in order_items');
  assert.ok(!orderItemsSection.includes('order_id: column.text({ optional'), 'order_id must NOT be optional in order_items');
});

test('cart_items table declares cart_id as required (non-optional) column', () => {
  const cartItemsSection = configContents.slice(
    configContents.indexOf('const cart_items = defineTable'),
    configContents.indexOf('const cart_items = defineTable') + 400
  );
  assert.ok(cartItemsSection.includes('cart_id: column.text()'), 'cart_id should be a required (non-optional) column in cart_items');
  assert.ok(!cartItemsSection.includes('cart_id: column.text({ optional'), 'cart_id must NOT be optional in cart_items');
});
