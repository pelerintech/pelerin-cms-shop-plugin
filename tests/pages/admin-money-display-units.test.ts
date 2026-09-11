import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pages = (p: string) => resolve(__dirname, `../../src/pages/admin/${p}`);

describe('Admin displays — money is minor→major (r40)', () => {
  it('product detail price table renders price_net as major (/100)', () => {
    const s = readFileSync(pages('products/[id].astro'), 'utf-8');
    assert.match(
      s,
      /\(\s*p\.price_net\s*\/\s*100\s*\)\.toFixed\(2\)/,
      'price table must /100 minor→major'
    );
    assert.doesNotMatch(s, /font-mono">\{p\.price_net\}/, 'must not render raw minor');
  });

  it('variant modal inherited price placeholder shows major (/100)', () => {
    const s = readFileSync(pages('products/[id].astro'), 'utf-8');
    assert.match(s, /eff\.price_net \/ 100/, 'ownVal must /100 minor→major');
    assert.match(s, /\$\{eff\.price_net \/ 100\} \(inherited/, 'inherited placeholder must /100');
  });

  it('order detail renders item + order money as major (/100)', () => {
    const s = readFileSync(pages('orders/[id].astro'), 'utf-8');
    assert.match(s, /\(\s*item\.price_net \/ 100\s*\)\.toFixed\(2\)/, 'item price_net /100');
    assert.match(s, /\(\s*item\.price_gross \/ 100\s*\)\.toFixed\(2\)/, 'item price_gross /100');
    assert.match(s, /\(\s*order\.total \/ 100\s*\)\.toFixed\(2\)/, 'order total /100');
    assert.match(s, /\(\s*order\.shipping_cost \/ 100\s*\)\.toFixed\(2\)/, 'shipping /100');
    assert.match(s, /\(\s*order\.discount_amount \/ 100\s*\)\.toFixed\(2\)/, 'discount /100');
    assert.match(s, /\(\s*order\.refund_amount \/ 100\s*\)\.toFixed\(2\)/, 'refund /100');
    assert.match(s, /\(\s*order\.subtotal_net \/ 100\s*\)\.toFixed\(2\)/, 'subtotal_net /100');
    assert.match(s, /\(\s*order\.vat_total \/ 100\s*\)\.toFixed\(2\)/, 'vat_total /100');
  });

  it('carts list total rendered as major (/100)', () => {
    const s = readFileSync(pages('carts/index.astro'), 'utf-8');
    assert.match(s, /\(\s*total \/ 100\s*\)\.toFixed\(2\)/, 'cart total must /100 minor→major');
  });
});
