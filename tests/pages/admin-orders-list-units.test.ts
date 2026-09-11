import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pages = (p: string) => resolve(__dirname, `../../src/pages/admin/${p}`);

describe('Admin orders list — total is minor→major (r41)', () => {
  it('renders the total through the formatMinor helper (minor→major)', () => {
    const s = readFileSync(pages('orders/index.astro'), 'utf-8');
    assert.match(
      s,
      /formatMinor\(\s*o\.total\s*,\s*o\.currency\s*\)/,
      'orders list total must render via formatMinor (minor→major)'
    );
    assert.match(
      s,
      /import \{ formatMinor \} from '..\/..\/..\/lib\/money\.ts'/,
      'formatMinor must be imported from lib/money.ts'
    );
  });

  it('does not render the raw (bare) minor total', () => {
    const s = readFileSync(pages('orders/index.astro'), 'utf-8');
    assert.doesNotMatch(
      s,
      /\(\s*o\.total\s*\|\|\s*0\s*\)\.toFixed\(2\)/,
      'must not render raw minor without /100'
    );
  });
});
