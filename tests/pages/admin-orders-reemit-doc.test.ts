import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

/**
 * The re-emit UI must document that the invoice event is emitted on demand via
 * the button, not automatically — so operators know it is a manual action.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const pagePath = resolve(__dirname, '../../src/pages/admin/orders/[id].astro');
const content = readFileSync(pagePath, 'utf-8');

test('re-emit UI documents that the invoice event is manual/on-demand', () => {
  assert.match(
    content,
    /invoice.{0,80}(on demand|on-demand|manually|not sent automatically)/i,
    're-emit UI must state the invoice event is emitted on demand (not automatically)'
  );
});
