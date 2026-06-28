import { test } from 'node:test';
import assert from 'node:assert';
import { buildProductImageKey } from '../../src/lib/storage-keys.ts';

test('buildProductImageKey produces the products/{pid}/{ts}-{rand}-{name} shape', () => {
  const key = buildProductImageKey('abc-123', 'tshirt.jpg');
  assert.match(key, /^products\/abc-123\/\d+-[a-z0-9]+-tshirt\.jpg$/);
});

test('buildProductImageKey sanitizes names with spaces and parentheses', () => {
  const key = buildProductImageKey('abc-123', 'My Photo (1).PNG');
  // No spaces, no parentheses in the sanitized segment
  assert.match(key, /^products\/abc-123\/\d+-[a-z0-9]+-My_Photo__1_\.PNG$/i);
});

test('buildProductImageKey is deterministic in prefix but unique in suffix', () => {
  const a = buildProductImageKey('abc-123', 'tshirt.jpg');
  const b = buildProductImageKey('abc-123', 'tshirt.jpg');
  assert.strictEqual(a.split('/').slice(0, 2).join('/'), 'products/abc-123');
  assert.strictEqual(b.split('/').slice(0, 2).join('/'), 'products/abc-123');
  assert.notStrictEqual(a, b, 'suffixes must differ across successive calls');
});

test('buildProductImageKey does not throw on empty product id', () => {
  assert.doesNotThrow(() => buildProductImageKey('', 'x.jpg'));
  const key = buildProductImageKey('', 'x.jpg');
  assert.match(key, /^products\/\/\d+-[a-z0-9]+-x\.jpg$/);
});
