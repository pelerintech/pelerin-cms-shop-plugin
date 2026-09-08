import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PAGES = [
  {
    name: 'orders',
    path: resolve(__dirname, '../../src/pages/admin/orders/index.astro'),
    basePath: '/admin/plugins/shop/orders',
  },
  {
    name: 'referral-codes',
    path: resolve(__dirname, '../../src/pages/admin/referral-codes/index.astro'),
    basePath: '/admin/plugins/shop/referral-codes',
  },
  {
    name: 'carts',
    path: resolve(__dirname, '../../src/pages/admin/carts/index.astro'),
    basePath: '/admin/plugins/shop/carts',
  },
];

describe('Orders, referral-codes, carts pages use the shared Pagination component (r38)', () => {
  for (const page of PAGES) {
    describe(`${page.name} page`, () => {
      it('imports the shared Pagination component', () => {
        const content = readFileSync(page.path, 'utf-8');
        assert.match(content, /import Pagination/, `${page.name} should import Pagination`);
      });

      it('renders <Pagination> with the correct basePath', () => {
        const content = readFileSync(page.path, 'utf-8');
        assert.match(content, /<Pagination\s/, `${page.name} should render <Pagination`);
        assert.match(
          content,
          new RegExp(`basePath="${escapeRegex(page.basePath)}"`),
          `${page.name} should pass its basePath`
        );
      });

      it('no longer contains an inline join pager that builds its own links', () => {
        const content = readFileSync(page.path, 'utf-8');
        assert.doesNotMatch(
          content,
          /class="join mt-4"/,
          `${page.name} should not inline the join pager markup`
        );
      });
    });
  }
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
