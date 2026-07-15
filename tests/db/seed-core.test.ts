import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const contents = readFileSync(new URL('../../src/db/seed.ts', import.meta.url), 'utf-8');

test('seed logs plugin name', () => {
  assert.ok(
    contents.includes('[Plugin:pelerin_ro_shop] Seeding...'),
    'seed should log plugin name'
  );
});

test('seed inserts locales as JSON in shop_settings', () => {
  assert.ok(contents.includes("'locales'"), 'seed should insert locales setting');
  assert.ok(contents.includes("'ro'"), 'seed should have ro locale');
  assert.ok(contents.includes("'en'"), 'seed should have en locale');
});

test('seed inserts currencies as JSON in shop_settings', () => {
  assert.ok(contents.includes("'currencies'"), 'seed should insert currencies setting');
  assert.ok(contents.includes("'RON'"), 'seed should have RON currency');
  assert.ok(contents.includes("'EUR'"), 'seed should have EUR currency');
});

test('seed inserts order_number_prefix setting', () => {
  assert.ok(
    contents.includes('order_number_prefix'),
    'seed should insert order_number_prefix setting'
  );
});

test('no shop_locales or shop_currencies references in seed', () => {
  assert.ok(!contents.includes('shop_locales'), 'seed should NOT reference shop_locales');
  assert.ok(!contents.includes('shop_currencies'), 'seed should NOT reference shop_currencies');
});
