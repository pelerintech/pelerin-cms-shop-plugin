import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pages = (p: string) => resolve(__dirname, `../../src/pages/admin/${p}`);

describe('Admin carts list — identity + delete (r41)', () => {
  it('renders a delete action that calls DELETE /api/plugins/shop/carts/[id]', () => {
    const s = readFileSync(pages('carts/index.astro'), 'utf-8');
    assert.match(
      s,
      /\/api\/plugins\/shop\/carts\/\$\{cart\.id\}/,
      'delete button must target the cart DELETE endpoint'
    );
    assert.match(s, /method:\s*'DELETE'/, 'delete call must use the DELETE method');
  });

  it('renders a Customer column resolving the cart user identity', () => {
    const s = readFileSync(pages('carts/index.astro'), 'utf-8');
    assert.match(s, />Customer</, 'must have a Customer column header');
    assert.match(s, /getUserById/, 'must resolve user identity via getUserById');
    assert.match(
      s,
      /cartUsers\.get\(cart\.id\)/,
      'must render the resolved customer identity per cart'
    );
  });
});
