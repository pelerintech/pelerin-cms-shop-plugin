import { test } from 'node:test';
import assert from 'node:assert';
import {
  CreateVoucherSchema,
  UpdateVoucherSchema,
} from '../../src/schemas/voucher.schema.ts';

test('fixed_amount without value is rejected', () => {
  const result = CreateVoucherSchema.safeParse({
    code: 'SAVE10',
    type: 'fixed_amount',
    min_order_value: null,
    max_uses: null,
    valid_from: null,
    valid_until: null,
    single_use_per_customer: false,
    active: true,
  });
  assert.strictEqual(result.success, false);
});

test('valid_until before valid_from is rejected', () => {
  const result = CreateVoucherSchema.safeParse({
    code: 'SAVE10',
    type: 'percentage',
    value: 10,
    min_order_value: null,
    max_uses: null,
    valid_from: '2025-01-15T00:00:00Z',
    valid_until: '2025-01-01T00:00:00Z',
    single_use_per_customer: false,
    active: true,
  });
  assert.strictEqual(result.success, false);
});

test('valid fixed_amount voucher is accepted', () => {
  const result = CreateVoucherSchema.safeParse({
    code: 'SAVE10',
    type: 'fixed_amount',
    value: 10,
    min_order_value: null,
    max_uses: null,
    valid_from: null,
    valid_until: null,
    single_use_per_customer: false,
    active: true,
  });
  assert.strictEqual(result.success, true);
});

test('valid percentage voucher is accepted', () => {
  const result = CreateVoucherSchema.safeParse({
    code: 'PCT20',
    type: 'percentage',
    value: 20,
    min_order_value: 50,
    max_uses: 100,
    valid_from: null,
    valid_until: null,
    single_use_per_customer: true,
    active: true,
  });
  assert.strictEqual(result.success, true);
});

test('valid free_shipping voucher is accepted', () => {
  const result = CreateVoucherSchema.safeParse({
    code: 'FREESHIP',
    type: 'free_shipping',
    min_order_value: null,
    max_uses: null,
    valid_from: null,
    valid_until: null,
    single_use_per_customer: false,
    active: true,
  });
  assert.strictEqual(result.success, true);
});

test('free_shipping voucher with value provided is accepted (value is ignored for free_shipping)', () => {
  // Spec: "WHEN type = free_shipping and value is provided THEN schema accepts (value is ignored)"
  const result = CreateVoucherSchema.safeParse({
    code: 'FREESHIP2',
    type: 'free_shipping',
    value: 9999,
    min_order_value: null,
    max_uses: null,
    valid_from: null,
    valid_until: null,
    single_use_per_customer: false,
    active: true,
  });
  assert.strictEqual(result.success, true, 'free_shipping with value provided must be accepted');
});

test('UpdateVoucherSchema allows partial updates', () => {
  const result = UpdateVoucherSchema.safeParse({
    active: false,
    uses_count: 5,
  });
  assert.strictEqual(result.success, true);
});
