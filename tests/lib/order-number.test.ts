import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ORDER_NUM_PATH = resolve(__dirname, '../../src/lib/order-number.ts');

test('order-number.ts does NOT import from astro:db', () => {
  const content = readFileSync(ORDER_NUM_PATH, 'utf-8');
  assert.doesNotMatch(content, /from\s+['"]astro:db['"]/,
    'order-number.ts must not import from astro:db — it is a pure re-export');
});

test('order-number.ts re-exports generateOrderNumber from ./data/orders.ts', () => {
  const content = readFileSync(ORDER_NUM_PATH, 'utf-8');
  assert.match(content, /export\s*\{[^}]*generateOrderNumber[^}]*\}\s*from\s+['"]\.\/data\/orders\.ts['"]/,
    'should re-export generateOrderNumber from ./data/orders.ts');
});

test('generateOrderNumber is importable and is a function', async () => {
  const mod = await import('../../src/lib/order-number.ts');
  assert.equal(typeof mod.generateOrderNumber, 'function');
});
