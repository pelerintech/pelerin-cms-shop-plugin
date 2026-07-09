import { test } from 'node:test';
import assert from 'node:assert';
import {
  CreateProductSchema,
  UpdateProductSchema,
  CreateVariantSchema,
  CreateAttributeSchema,
  CreateAttributeOptionSchema,
} from '../../src/schemas/product.schema.ts';

test('CreateProductSchema rejects empty SKU', () => {
  const result = CreateProductSchema.safeParse({
    type: 'physical',
    sku: '',
    has_variants: false,
    active: true,
  });
  assert.strictEqual(result.success, false);
});

test('CreateProductSchema rejects negative stock', () => {
  const result = CreateProductSchema.safeParse({
    type: 'physical',
    stock: -5,
    has_variants: false,
    active: true,
  });
  assert.strictEqual(result.success, false);
});

test('CreateProductSchema rejects invalid type', () => {
  const result = CreateProductSchema.safeParse({
    type: 'invalid',
    has_variants: false,
    active: true,
  });
  assert.strictEqual(result.success, false);
});

test('CreateProductSchema accepts valid minimal payload', () => {
  const result = CreateProductSchema.safeParse({
    type: 'physical',
    has_variants: false,
    active: true,
    name: 'Test Product',
    slug: 'test-product',
  });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.type, 'physical');
    assert.strictEqual(result.data.has_variants, false);
    assert.strictEqual(result.data.name, 'Test Product');
  }
});

test('CreateProductSchema accepts null stock', () => {
  const result = CreateProductSchema.safeParse({
    type: 'digital',
    stock: null,
    has_variants: false,
    active: true,
    name: 'Digital Product',
    slug: 'digital-product',
  });
  assert.strictEqual(result.success, true);
});

test('CreateVariantSchema requires positive quantity stock (or null)', () => {
  const ok = CreateVariantSchema.safeParse({
    product_id: 'uuid-123',
    sku: 'VAR-1',
    stock: 0,
    active: true,
  });
  assert.strictEqual(ok.success, false);

  const ok2 = CreateVariantSchema.safeParse({
    product_id: 'uuid-123',
    stock: null,
    active: true,
  });
  assert.strictEqual(ok2.success, true);
});

test('CreateAttributeSchema validates type enum', () => {
  const bad = CreateAttributeSchema.safeParse({
    name: 'Color',
    type: 'invalid',
  });
  assert.strictEqual(bad.success, false);

  const good = CreateAttributeSchema.safeParse({
    name: 'Color',
    type: 'select',
  });
  assert.strictEqual(good.success, true);
});

test('CreateAttributeOptionSchema validates basic shape', () => {
  const result = CreateAttributeOptionSchema.safeParse({
    attribute_id: 'uuid-123',
    value: 'red',
  });
  assert.strictEqual(result.success, true);
});

test('UpdateProductSchema allows partial updates', () => {
  const result = UpdateProductSchema.safeParse({
    active: false,
  });
  assert.strictEqual(result.success, true);
});
