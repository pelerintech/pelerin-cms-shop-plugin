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
    assert.match(
      content,
      /opacity-0|invisible/,
      'Filter button wrapper label should have invisible spacer class'
    );
  });
});

describe('Products list page - accessor pagination (r38)', () => {
  it('derives totalPages from result.total', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(
      content,
      /total\s*=\s*result\.total/,
      'total should come from result.total, not the paginated array length'
    );
    assert.match(content, /Math\.ceil\(total \/ limit\)/, 'totalPages should derive from total');
  });

  it('does not re-slice an already-paginated array', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.doesNotMatch(
      content,
      /\.slice\(\(page - 1\) \* limit/,
      'page must not re-slice the paginated result'
    );
    assert.doesNotMatch(content, /productList\.slice\(/, 'should not slice productList');
  });

  it('imports and renders the shared Pagination component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /import Pagination/, 'should import Pagination');
    assert.match(content, /<Pagination\s/, 'should render <Pagination');
    assert.match(
      content,
      /basePath="\/admin\/plugins\/shop\/products"/,
      'should pass products basePath'
    );
  });

  it('passes type to listProducts (server-side filter)', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /type:\s*filterType/, 'should pass type to listProducts');
  });

  it('no longer filters type client-side', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.doesNotMatch(
      content,
      /\.filter\(\(p\) => p\.type/,
      'must not post-filter products by type in JS'
    );
  });
});
