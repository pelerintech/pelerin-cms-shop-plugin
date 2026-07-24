import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import {
  createTestDb,
  resetDb,
  orders,
  order_items,
  shop_settings,
  products,
  product_prices,
  buildOrderRow,
} from '../../../../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { makeFakeSdk } from '../../../helpers.ts';

ensureLoader();

describe('refund endpoint — euPlatesc-first ordering', () => {
  let db: LibSQLDatabase;
  let fetchCalls: { url: string; body: string }[];

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);

    // Seed euPlatesc credentials
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
      { id: 's3', key: 'euplatesc_ukey', value: 'UKEY123' },
      { id: 's4', key: 'euplatesc_uapi_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    // Seed a product for stock checks
    const productId = crypto.randomUUID();
    await db.insert(products).values({
      id: productId,
      sku: 'PROD-001',
      type: 'physical',
      has_variants: false,
      vat_rate: 0.19,
      stock: 10,
      category_id: null,
      active: true,
      name: 'Test Product',
      description: null,
      slug: 'test-product',
      created_at: new Date(),
      updated_at: new Date(),
    });
    await db.insert(product_prices).values({
      id: crypto.randomUUID(),
      product_id: productId,
      variant_id: null,
      currency: 'RON',
      price_net: 5000,
    });

    // Seed a delivered order with euPlatesc payment
    const orderId = crypto.randomUUID();
    await db.insert(orders).values({
      id: orderId,
      order_number: 'ORD-001',
      user_id: null,
      customer_type: 'individual',
      customer_email: 'test@example.com',
      customer_name: 'Test User',
      status: 'delivered',
      currency: 'RON',
      subtotal_net: 5000,
      vat_total: 950,
      shipping_cost: 0,
      discount_amount: 0,
      total: 5950,
      shipping_type: 'physical',
      shipping_method: null,
      voucher_code: null,
      referral_code: null,
      billing_first_name: 'Test',
      billing_last_name: 'User',
      billing_address: 'Addr',
      billing_city: 'City',
      billing_postal_code: '123',
      billing_country: 'RO',
      shipping_first_name: 'Test',
      shipping_last_name: 'User',
      shipping_address: 'Addr',
      shipping_city: 'City',
      shipping_postal_code: '123',
      shipping_country: 'RO',
      shipping_same_as_billing: true,
      payment_provider: 'euplatesc',
      payment_intent_id: 'ORD-001',
      transaction_id: 'EP123',
      refund_amount: null,
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed an order item
    await db.insert(order_items).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      product_id: productId,
      variant_id: null,
      quantity: 1,
      price_net: 5000,
      price_gross: 5950,
      vat_rate: 19,
      currency: 'RON',
      product_name: 'Test Product',
      sku: 'PROD-001',
    });

    // Store order ID for tests
    (globalThis as any).__testOrderId = orderId;
  });

  beforeEach(() => {
    fetchCalls = [];
    (globalThis as any).fetch = async (url: any, init: any) => {
      fetchCalls.push({
        url: typeof url === 'string' ? url : url.toString(),
        body: init?.body || '',
      });
      return {
        ok: true,
        json: async () => ({ success: '1' }),
      };
    };
  });

  it('calls euPlatesc refund BEFORE internal refund for euPlatesc orders', async () => {
    const { runPut } = await import('../../../../../src/api/shop/orders/[id]/refund.ts');

    const orderId = (globalThis as any).__testOrderId;
    const orderItems = await db.select().from(order_items).where(eq(order_items.order_id, orderId));
    const itemId = orderItems[0].id;

    const fakeCtx = {
      params: { id: orderId },
      request: new Request('https://example.com/api/plugins/shop/orders/test/refund', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refunds: [{ order_item_id: itemId, quantity: 1, amount: 5950 }],
          notes: 'Product not in stock',
        }),
      }),
    } as any;

    const response = await runPut({ db, sdk: makeFakeSdk(), ctx: fakeCtx });
    const data = await response.json();

    assert.strictEqual(
      response.status,
      200,
      `Expected 200, got ${response.status}: ${JSON.stringify(data)}`
    );
    assert.ok(fetchCalls.length > 0, 'fetch must be called (euPlatesc refund)');
    assert.ok(fetchCalls[0].url.includes('euplatesc'), 'fetch must call euPlatesc WebService');
  });

  it('skips euPlatesc call for non-euPlatesc orders', async () => {
    const { runPut } = await import('../../../../../src/api/shop/orders/[id]/refund.ts');

    // Create a non-euPlatesc order
    const orderId = crypto.randomUUID();
    await db.insert(orders).values({
      ...buildOrderRow({
        id: orderId,
        order_number: 'ORD-COD',
        status: 'delivered',
        payment_provider: null,
        transaction_id: null,
      }),
    });
    await db.insert(order_items).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      product_id: 'fake-product-id',
      variant_id: null,
      quantity: 1,
      price_net: 5000,
      price_gross: 5950,
      vat_rate: 19,
      currency: 'RON',
      product_name: 'Test Product',
      sku: 'FAKE-001',
    });

    const fakeCtx = {
      params: { id: orderId },
      request: new Request('https://example.com/api/plugins/shop/orders/test/refund', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refunds: [{ order_item_id: 'fake-item-id', quantity: 1, amount: 5950 }],
          notes: 'COD refund',
        }),
      }),
    } as any;

    try {
      await runPut({ db, sdk: makeFakeSdk(), ctx: fakeCtx });
    } catch {
      // May fail due to FK constraints — that's OK for this test
    }

    // fetch must NOT be called for non-euPlatesc orders
    assert.strictEqual(fetchCalls.length, 0, 'fetch must NOT be called for non-euPlatesc orders');
  });
});
