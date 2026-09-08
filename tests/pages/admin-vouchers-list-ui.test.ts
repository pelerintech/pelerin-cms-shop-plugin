import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAGE_PATH = resolve(__dirname, '../../src/pages/admin/vouchers/index.astro');

describe('Vouchers list page - accessor pagination (r38)', () => {
  it('derives totalPages from result.total', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /total\s*=\s*result\.total/, 'total should come from result.total');
    assert.match(content, /Math\.ceil\(total \/ limit\)/, 'totalPages should derive from total');
  });

  it('does not re-slice an already-paginated array', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.doesNotMatch(
      content,
      /\.slice\(\(page - 1\) \* limit/,
      'must not re-slice the paginated result'
    );
    assert.doesNotMatch(content, /vouchersPaginated\.slice\(/, 'must not slice vouchersPaginated');
  });

  it('imports and renders the shared Pagination component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /import Pagination/, 'should import Pagination');
    assert.match(content, /<Pagination\s/, 'should render <Pagination');
    assert.match(
      content,
      /basePath="\/admin\/plugins\/shop\/vouchers"/,
      'should pass vouchers basePath'
    );
  });

  it('passes type to listVouchers (server-side filter)', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /type:\s*typeFilter/, 'should pass type to listVouchers');
  });

  it('no longer filters type client-side', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.doesNotMatch(
      content,
      /\.filter\(\(v\) => v\.type/,
      'must not post-filter vouchers by type in JS'
    );
  });
});
