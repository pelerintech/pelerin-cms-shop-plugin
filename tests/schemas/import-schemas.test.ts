/**
 * Tests for src/schemas/import.schema.ts — Zod schemas for CSV import rows.
 *
 * ProductImportRowSchema validates a single parsed-CSV row (Record<string,string>).
 * It coerces string CSV values into typed values (vat_rate → number, stock → int),
 * enforces required fields, and rejects invalid enum values.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ProductImportRowSchema, PriceImportRowSchema } from '../../src/schemas/import.schema.ts';

test('ProductImportRowSchema accepts a valid row with all fields', () => {
  const row = {
    sku: 'TEST-001',
    name_ro: 'Test Genetic Complet',
    name_en: 'Complete Genetic Test',
    description_ro: 'O descriere',
    description_en: 'A description',
    type: 'physical',
    category_slug: 'teste-genetice',
    vat_rate: '0.19',
    stock: '50',
  };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(parsed.success, 'should parse a fully-populated row');
  assert.strictEqual(parsed.data.sku, 'TEST-001');
  assert.strictEqual(parsed.data.name_ro, 'Test Genetic Complet');
  assert.strictEqual(parsed.data.type, 'physical');
  assert.strictEqual(parsed.data.vat_rate, 0.19);
  assert.strictEqual(parsed.data.stock, 50);
  assert.strictEqual(parsed.data.category_slug, 'teste-genetice');
});

test('ProductImportRowSchema accepts a row with only required fields', () => {
  const row = { sku: 'TEST-002', name_ro: 'Vitamina D', type: 'digital' };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(parsed.success, 'only sku, name_ro, type are required');
  assert.strictEqual(parsed.data.name_en, undefined);
  assert.strictEqual(parsed.data.stock, undefined);
  assert.strictEqual(parsed.data.category_slug, undefined);
});

test('ProductImportRowSchema rejects missing sku', () => {
  const row = { name_ro: 'No SKU', type: 'physical' };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(!parsed.success, 'missing sku must fail');
  const paths = parsed.error.issues.map(i => i.path.join('.'));
  assert.ok(paths.includes('sku'), 'error should reference sku');
});

test('ProductImportRowSchema rejects missing name_ro', () => {
  const row = { sku: 'TEST-003', type: 'physical' };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(!parsed.success);
  const paths = parsed.error.issues.map(i => i.path.join('.'));
  assert.ok(paths.includes('name_ro'));
});

test('ProductImportRowSchema rejects missing type', () => {
  const row = { sku: 'TEST-004', name_ro: 'Thing' };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(!parsed.success);
  const paths = parsed.error.issues.map(i => i.path.join('.'));
  assert.ok(paths.includes('type'));
});

test('ProductImportRowSchema rejects invalid type value', () => {
  const row = { sku: 'TEST-005', name_ro: 'Thing', type: 'xyz' };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(!parsed.success, 'type must be physical|digital');
  const paths = parsed.error.issues.map(i => i.path.join('.'));
  assert.ok(paths.includes('type'));
});

test('ProductImportRowSchema rejects empty sku (whitespace-only)', () => {
  const row = { sku: '   ', name_ro: 'Thing', type: 'physical' };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(!parsed.success, 'whitespace-only sku is effectively missing');
});

test('ProductImportRowSchema rejects vat_rate outside 0–1', () => {
  const row = { sku: 'TEST-006', name_ro: 'Thing', type: 'physical', vat_rate: '1.5' };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(!parsed.success);
  const paths = parsed.error.issues.map(i => i.path.join('.'));
  assert.ok(paths.includes('vat_rate'));
});

test('ProductImportRowSchema rejects non-integer stock', () => {
  const row = { sku: 'TEST-007', name_ro: 'Thing', type: 'physical', stock: '12.5' };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(!parsed.success);
  const paths = parsed.error.issues.map(i => i.path.join('.'));
  assert.ok(paths.includes('stock'));
});

test('ProductImportRowSchema allows empty stock (unlimited) and empty vat_rate', () => {
  const row = { sku: 'TEST-008', name_ro: 'Thing', type: 'physical', vat_rate: '', stock: '' };
  const parsed = ProductImportRowSchema.safeParse(row);
  assert.ok(parsed.success, 'empty optional numeric fields are allowed (→ undefined)');
  assert.strictEqual(parsed.data.stock, undefined);
  assert.strictEqual(parsed.data.vat_rate, undefined);
});

// ── PriceImportRowSchema ──

test('PriceImportRowSchema accepts a valid price row', () => {
  const parsed = PriceImportRowSchema.safeParse({ sku: 'TEST-001', currency: 'RON', price_net: '250.00' });
  assert.ok(parsed.success);
  assert.strictEqual(parsed.data.sku, 'TEST-001');
  assert.strictEqual(parsed.data.currency, 'RON');
  assert.strictEqual(parsed.data.price_net, 250.00);
});

test('PriceImportRowSchema rejects missing sku', () => {
  assert.ok(!PriceImportRowSchema.safeParse({ currency: 'RON', price_net: '10' }).success);
});

test('PriceImportRowSchema rejects missing currency', () => {
  assert.ok(!PriceImportRowSchema.safeParse({ sku: 'X', price_net: '10' }).success);
});

test('PriceImportRowSchema rejects missing price_net', () => {
  assert.ok(!PriceImportRowSchema.safeParse({ sku: 'X', currency: 'RON' }).success);
});

test('PriceImportRowSchema rejects non-positive price_net', () => {
  assert.ok(!PriceImportRowSchema.safeParse({ sku: 'X', currency: 'RON', price_net: '0' }).success);
  assert.ok(!PriceImportRowSchema.safeParse({ sku: 'X', currency: 'RON', price_net: '-5' }).success);
});

test('PriceImportRowSchema rejects non-numeric price_net', () => {
  assert.ok(!PriceImportRowSchema.safeParse({ sku: 'X', currency: 'RON', price_net: 'abc' }).success);
});
