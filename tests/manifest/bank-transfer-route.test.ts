/**
 * Ensure the bank-transfer admin settings page is registered in
 * pelerin.manifest.json so the CMS routes it via injectRoute.
 *
 * The page file exists at src/pages/admin/settings/payments/bank-transfer.astro
 * but the manifest entry was omitted — without it the card link 404s.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MANIFEST_PATH = resolve(__dirname, '../../pelerin.manifest.json');

test('manifest adminPages contains the bank-transfer entry', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  const adminPages = manifest.adminPages as Array<{ pattern: string; entrypoint: string }>;
  const entry = adminPages.find(
    (p: any) => p.pattern === '/admin/plugins/shop/settings/payments/bank-transfer'
  );
  assert.ok(entry, 'adminPages must have an entry for bank-transfer settings page');
  assert.equal(entry.entrypoint, './src/pages/admin/settings/payments/bank-transfer.astro');
});
