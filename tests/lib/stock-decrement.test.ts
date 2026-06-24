import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STOCK_PATH = resolve(__dirname, '../../src/lib/stock-decrement.ts');

describe('Stock decrement re-export module', () => {
  it('does NOT import from astro:db', () => {
    const content = readFileSync(STOCK_PATH, 'utf-8');
    assert.doesNotMatch(content, /from\s+['"]astro:db['"]/,
      'stock-decrement.ts must not import from astro:db — it is a pure re-export');
  });

  it('re-exports decrementStock from ./data/orders.ts', () => {
    const content = readFileSync(STOCK_PATH, 'utf-8');
    assert.match(content, /export\s*\{[^}]*decrementStock[^}]*\}\s*from\s+['"]\.\/data\/orders\.ts['"]/,
      'should re-export decrementStock from ./data/orders.ts');
  });

  it('decrementStock is importable and is a function', async () => {
    const mod = await import('../../src/lib/stock-decrement.ts');
    assert.equal(typeof mod.decrementStock, 'function');
  });
});
