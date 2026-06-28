import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/pages/admin/products/[id].astro', import.meta.url), 'utf-8');

test('admin product edit page does NOT read product_images inline (bypassing the accessor)', () => {
  // The old pattern at line ~43: db.select().from(product_images)... must be gone.
  assert.doesNotMatch(
    source,
    /db\.select\(\)\s*\.from\(\s*product_images\s*\)/,
    'page must not do an inline db.select().from(product_images); reads must go through listProductImage',
  );
  assert.doesNotMatch(
    source,
    /from\(\s*product_images\s*\)/,
    'page must not reference product_images in a from() clause inline',
  );
});

test('admin product edit page calls listProductImage(db, sdk, id) and passes resolved rows to ImageUpload', () => {
  assert.match(source, /import\s+\{[^}]*\blistProductImage\b[^}]*\}\s+from\s+['"][^'"]*lib\/data\/products['"]/, 'page must import listProductImage');
  assert.match(source, /listProductImage\(\s*db\s*,\s*sdk\s*,/, 'page must call listProductImage(db, sdk, id) — sdk injected for resolution');
  assert.match(source, /existingFiles=/, 'page must pass existingFiles to ImageUpload');
});

test('admin product edit page constructs an sdk via createPluginContext() and passes it to the accessor', () => {
  assert.match(source, /createPluginContext\(\)/, 'page must construct sdk via createPluginContext()');
});
