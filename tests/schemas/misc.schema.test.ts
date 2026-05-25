import { test } from 'node:test';
import assert from 'node:assert';
import { CreatePriceSchema } from '../../src/schemas/product.schema.ts';
import { CreateCartItemSchema } from '../../src/schemas/cart.schema.ts';
import { CreateReferralCodeSchema } from '../../src/schemas/referral.schema.ts';
import { ShopSettingsSchema } from '../../src/schemas/settings.schema.ts';

test('price schema rejects negative price_net', () => {
  const result = CreatePriceSchema.safeParse({
    product_id: 'prod-1',
    variant_id: null,
    currency: 'RON',
    price_net: -0.01,
  });
  assert.strictEqual(result.success, false, 'negative price_net must be rejected');
  if (!result.success) {
    const priceError = result.error.issues.find(i => i.path.includes('price_net'));
    assert.ok(priceError, 'error must be on price_net field');
  }
});

test('price schema rejects both-null product_id and variant_id', () => {
  const result = CreatePriceSchema.safeParse({
    product_id: null,
    variant_id: null,
    currency: 'RON',
    price_net: 100,
  });
  assert.strictEqual(result.success, false);
});

test('price schema rejects both-set product_id and variant_id', () => {
  const result = CreatePriceSchema.safeParse({
    product_id: 'prod-1',
    variant_id: 'var-1',
    currency: 'RON',
    price_net: 100,
  });
  assert.strictEqual(result.success, false);
});

test('price schema accepts only-product_id', () => {
  const result = CreatePriceSchema.safeParse({
    product_id: 'prod-1',
    variant_id: null,
    currency: 'RON',
    price_net: 100,
  });
  assert.strictEqual(result.success, true);
});

test('referral schema rejects empty code', () => {
  const result = CreateReferralCodeSchema.safeParse({
    code: '',
    name: 'Partner A',
    active: true,
  });
  assert.strictEqual(result.success, false);
});

test('referral schema accepts valid payload', () => {
  const result = CreateReferralCodeSchema.safeParse({
    code: 'PARTNER10',
    name: 'Partner A',
    discount_type: 'percentage',
    discount_value: 10,
    active: true,
  });
  assert.strictEqual(result.success, true);
});

test('cart item schema rejects quantity < 1', () => {
  const result = CreateCartItemSchema.safeParse({
    cart_id: 'cart-1',
    product_id: 'prod-1',
    quantity: 0,
  });
  assert.strictEqual(result.success, false);
});

test('cart item schema accepts valid payload', () => {
  const result = CreateCartItemSchema.safeParse({
    cart_id: 'cart-1',
    product_id: 'prod-1',
    variant_id: null,
    quantity: 2,
  });
  assert.strictEqual(result.success, true);
});

test('shop settings schema validates order_number keys', () => {
  const result = ShopSettingsSchema.safeParse({
    order_number_prefix: 'ORD',
    order_number_year: '2025',
    order_number_padding: 6,
    order_number_sequence: 42,
  });
  assert.strictEqual(result.success, true);
});

test('index.ts re-exports all schemas', async () => {
  const index = await import('../../src/schemas/index.ts');
  assert.ok(index.OrderStatus, 'OrderStatus should be exported');
  assert.ok(index.CreateProductSchema, 'CreateProductSchema should be exported');
  assert.ok(index.CreateOrderSchema, 'CreateOrderSchema should be exported');
  assert.ok(index.CreateVoucherSchema, 'CreateVoucherSchema should be exported');
  assert.ok(index.CreateCartItemSchema, 'CreateCartItemSchema should be exported');
  assert.ok(index.CreateReferralCodeSchema, 'CreateReferralCodeSchema should be exported');
  assert.ok(index.ShopSettingsSchema, 'ShopSettingsSchema should be exported');
});

test('settings.schema.ts exports Update and Output schemas', async () => {
  // Brief: "Each exports: input schemas (create/update), output schemas, and inferred TypeScript types"
  const settings = await import('../../src/schemas/settings.schema.ts');
  assert.ok(settings.ShopSettingsSchema, 'ShopSettingsSchema (input/create) should be exported');
  assert.ok(settings.UpdateShopSettingsSchema, 'UpdateShopSettingsSchema should be exported');
  assert.ok(settings.ShopSettingOutputSchema, 'ShopSettingOutputSchema should be exported');
});
