import { test } from 'node:test';
import assert from 'node:assert';
import {
  CreateOrderSchema,
  UpdateOrderStatusSchema,
  AddressSchema,
} from '../../src/schemas/order.schema.ts';

test('company order without billing_company is rejected', () => {
  const result = CreateOrderSchema.safeParse({
    customer_type: 'company',
    customer_email: 'acme@example.com',
    customer_name: 'ACME Corp',
    status: 'pending',
    currency: 'RON',
    subtotal_net: 100,
    vat_total: 19,
    shipping_cost: 10,
    discount_amount: 0,
    total: 129,
    shipping_type: 'physical',
    billing_company: null,
    billing_vat_number: null,
    billing_first_name: 'John',
    billing_last_name: 'Doe',
    billing_address: '123 Main',
    billing_city: 'Bucharest',
    billing_postal_code: '010101',
    billing_country: 'RO',
    billing_county: null,
    billing_phone: null,
    shipping_first_name: 'John',
    shipping_last_name: 'Doe',
    shipping_address: '123 Main',
    shipping_city: 'Bucharest',
    shipping_postal_code: '010101',
    shipping_country: 'RO',
    shipping_county: null,
    shipping_phone: null,
    shipping_same_as_billing: true,
  });
  assert.strictEqual(result.success, false);
});

test('company order without billing_vat_number is rejected', () => {
  const result = CreateOrderSchema.safeParse({
    customer_type: 'company',
    customer_email: 'acme@example.com',
    customer_name: 'ACME Corp',
    status: 'pending',
    currency: 'RON',
    subtotal_net: 100,
    vat_total: 19,
    shipping_cost: 10,
    discount_amount: 0,
    total: 129,
    shipping_type: 'physical',
    billing_company: 'ACME Corp',
    billing_vat_number: null,
    billing_first_name: 'John',
    billing_last_name: 'Doe',
    billing_address: '123 Main',
    billing_city: 'Bucharest',
    billing_postal_code: '010101',
    billing_country: 'RO',
    billing_county: null,
    billing_phone: null,
    shipping_first_name: 'John',
    shipping_last_name: 'Doe',
    shipping_address: '123 Main',
    shipping_city: 'Bucharest',
    shipping_postal_code: '010101',
    shipping_country: 'RO',
    shipping_county: null,
    shipping_phone: null,
    shipping_same_as_billing: true,
  });
  assert.strictEqual(result.success, false);
});

test('individual order without company fields is accepted', () => {
  const result = CreateOrderSchema.safeParse({
    customer_type: 'individual',
    customer_email: 'john@example.com',
    customer_name: 'John Doe',
    status: 'pending',
    currency: 'RON',
    subtotal_net: 100,
    vat_total: 19,
    shipping_cost: 10,
    discount_amount: 0,
    total: 129,
    shipping_type: 'physical',
    billing_first_name: 'John',
    billing_last_name: 'Doe',
    billing_address: '123 Main',
    billing_city: 'Bucharest',
    billing_postal_code: '010101',
    billing_country: 'RO',
    shipping_same_as_billing: false,
    shipping_first_name: 'John',
    shipping_last_name: 'Doe',
    shipping_address: '456 Elm',
    shipping_city: 'Cluj',
    shipping_postal_code: '400000',
    shipping_country: 'RO',
    items: [
      {
        product_name: 'Widget',
        quantity: 1,
        price_net: 100,
        vat_rate: 0.19,
        price_gross: 119,
        currency: 'RON',
      },
    ],
  });
  assert.strictEqual(result.success, true);
});

test('shipping_same_as_billing = true makes shipping fields optional', () => {
  const result = CreateOrderSchema.safeParse({
    customer_type: 'individual',
    customer_email: 'john@example.com',
    customer_name: 'John Doe',
    status: 'pending',
    currency: 'RON',
    subtotal_net: 100,
    vat_total: 19,
    shipping_cost: 10,
    discount_amount: 0,
    total: 129,
    shipping_type: 'physical',
    billing_first_name: 'John',
    billing_last_name: 'Doe',
    billing_address: '123 Main',
    billing_city: 'Bucharest',
    billing_postal_code: '010101',
    billing_country: 'RO',
    shipping_same_as_billing: true,
    items: [
      {
        product_name: 'Widget',
        quantity: 1,
        price_net: 100,
        vat_rate: 0.19,
        price_gross: 119,
        currency: 'RON',
      },
    ],
  });
  assert.strictEqual(result.success, true);
});

test('shipping_same_as_billing = false requires shipping fields', () => {
  const result = CreateOrderSchema.safeParse({
    customer_type: 'individual',
    customer_email: 'john@example.com',
    customer_name: 'John Doe',
    status: 'pending',
    currency: 'RON',
    subtotal_net: 100,
    vat_total: 19,
    shipping_cost: 10,
    discount_amount: 0,
    total: 129,
    shipping_type: 'physical',
    billing_first_name: 'John',
    billing_last_name: 'Doe',
    billing_address: '123 Main',
    billing_city: 'Bucharest',
    billing_postal_code: '010101',
    billing_country: 'RO',
    shipping_same_as_billing: false,
    items: [
      {
        product_name: 'Widget',
        quantity: 1,
        price_net: 100,
        vat_rate: 0.19,
        price_gross: 119,
        currency: 'RON',
      },
    ],
  });
  assert.strictEqual(result.success, false);
});
test('invalid status is rejected', () => {
  const result = CreateOrderSchema.safeParse({
    customer_type: 'individual',
    customer_email: 'john@example.com',
    customer_name: 'John Doe',
    status: 'unknown_status',
    currency: 'RON',
    subtotal_net: 100,
    vat_total: 19,
    shipping_cost: 10,
    discount_amount: 0,
    total: 129,
    shipping_type: 'physical',
    billing_first_name: 'John',
    billing_last_name: 'Doe',
    billing_address: '123 Main',
    billing_city: 'Bucharest',
    billing_postal_code: '010101',
    billing_country: 'RO',
    shipping_same_as_billing: true,
  });
  assert.strictEqual(result.success, false);
});

test('UpdateOrderStatusSchema validates status enum', () => {
  const bad = UpdateOrderStatusSchema.safeParse({ status: 'nope' });
  const good = UpdateOrderStatusSchema.safeParse({ status: 'paid' });
  assert.strictEqual(bad.success, false);
  assert.strictEqual(good.success, true);
});

test('AddressSchema validates required address fields', () => {
  const bad = AddressSchema.safeParse({
    first_name: 'John',
  });
  const good = AddressSchema.safeParse({
    first_name: 'John',
    last_name: 'Doe',
    address: '123 Main',
    city: 'Bucharest',
    postal_code: '010101',
    country: 'RO',
  });
  assert.strictEqual(bad.success, false);
  assert.strictEqual(good.success, true);
});
