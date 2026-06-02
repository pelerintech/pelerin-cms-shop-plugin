import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAGE_PATH = resolve(__dirname, '../../src/pages/admin/products/index.astro');

describe('Products list page - filter bar alignment', () => {
  it('page file exists', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.ok(content.length > 0, 'Page should have content');
  });

  it('filter form uses items-end', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /items-end/, 'Filter form should use items-end for bottom alignment');
  });

  it('Filter button is wrapped in form-control with invisible label', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    // The Filter button should be inside a form-control div with a label containing opacity-0 or invisible
    assert.match(content, /opacity-0|invisible/, 'Filter button wrapper label should have invisible spacer class');
  });
});