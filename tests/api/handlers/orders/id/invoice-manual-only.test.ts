import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

/**
 * Invoice is emitted ONLY on demand via the admin "Emit invoice event" button
 * (reemit-event.ts). No auto-emission path may publish `shop.order.invoice`.
 *
 * reemit-event.ts publishes via a variable (`sdk.events.publish(event, data)`),
 * so the honest check is that the `shop.order.invoice` event literal is
 * referenced ONLY in the manual re-emit handler within src/api — no
 * checkout/status/refund/cancel/webhook path handles it.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(__dirname, '../../../../../src');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

function filesContainingInvoiceLiteral(): string[] {
  const hits: string[] = [];
  for (const file of walk(SRC_ROOT)) {
    const content = readFileSync(file, 'utf-8');
    if (content.includes("'shop.order.invoice'") || content.includes('"shop.order.invoice"')) {
      hits.push(file);
    }
  }
  return hits;
}

test('shop.order.invoice is referenced only in the manual re-emit handler (manual-only)', () => {
  const hits = filesContainingInvoiceLiteral();
  assert.deepEqual(
    hits,
    [resolve(SRC_ROOT, 'api/shop/orders/[id]/reemit-event.ts')],
    `shop.order.invoice must only be referenced in reemit-event.ts, found: ${hits.join(', ') || 'none'}`
  );
});
