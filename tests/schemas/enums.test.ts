import { test } from 'node:test';
import assert from 'node:assert';
import { OrderStatus, ProductType, ShippingType, VoucherType, CustomerType, OptionValueType } from '../../src/schemas/enums.ts';

test('OrderStatus enum exports correct values', () => {
  assert.deepStrictEqual(OrderStatus.options, [
    'pending',
    'awaiting_payment',
    'paid',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'refund_requested',
    'refunded',
  ]);
});

test('ProductType enum exports correct values', () => {
  assert.deepStrictEqual(ProductType.options, ['physical', 'digital']);
});

test('ShippingType enum exports correct values', () => {
  assert.deepStrictEqual(ShippingType.options, ['physical', 'digital', 'pickup']);
});

test('VoucherType enum exports correct values', () => {
  assert.deepStrictEqual(VoucherType.options, ['fixed_amount', 'percentage', 'free_shipping']);
});

test('CustomerType enum exports correct values', () => {
  assert.deepStrictEqual(CustomerType.options, ['individual', 'company']);
});

test('OptionValueType enum exports correct values', () => {
  assert.deepStrictEqual(OptionValueType.options, ['short_text', 'long_text', 'number', 'boolean', 'list']);
});
