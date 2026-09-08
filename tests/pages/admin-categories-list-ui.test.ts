import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAGE_PATH = resolve(__dirname, '../../src/pages/admin/categories/index.astro');

describe('Categories list page - accessor pagination (r38)', () => {
  it('calls listCategories with page, limit, search', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(
      content,
      /listCategories\(\s*sdk\.db,\s*defaultLocale,\s*\{\s*page,\s*limit,\s*search/,
      'should pass { page, limit, search } to listCategories'
    );
  });

  it('derives totalPages from result.total', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /total\s*=\s*result\.total/, 'total should come from result.total');
    assert.match(content, /Math\.ceil\(total \/ limit\)/, 'totalPages should derive from total');
    assert.match(content, /result\.rows/, 'should iterate result.rows');
  });

  it('imports and renders the shared Pagination component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /import Pagination/, 'should import Pagination');
    assert.match(content, /<Pagination\s/, 'should render <Pagination');
    assert.match(
      content,
      /basePath="\/admin\/plugins\/shop\/categories"/,
      'should pass categories basePath'
    );
  });

  it('no longer slices a fetched-full array client-side', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.doesNotMatch(content, /filteredCats\.slice\(/, 'must not slice filteredCats');
    assert.doesNotMatch(content, /allCats\.slice\(/, 'must not slice allCats');
    assert.doesNotMatch(
      content,
      /\.slice\(offset, offset \+ limit\)/,
      'must not slice client-side'
    );
  });
});
