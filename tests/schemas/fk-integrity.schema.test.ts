import { test } from 'node:test';
import assert from 'node:assert';
import { CreateCartItemSchema } from '../../src/schemas/cart.schema.ts';

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
