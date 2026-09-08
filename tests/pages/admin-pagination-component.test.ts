import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMPONENT_PATH = resolve(__dirname, '../../src/components/admin/Pagination.astro');

describe('Pagination.astro shared component', () => {
  it('the component file exists', () => {
    assert.ok(existsSync(COMPONENT_PATH), 'src/components/admin/Pagination.astro should exist');
  });

  it('declares the Props interface with page, totalPages, basePath, and optional params', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /interface\s+Props/, 'should declare a Props interface');
    assert.match(content, /page\s*:\s*number/, 'Props should declare page: number');
    assert.match(content, /totalPages\s*:\s*number/, 'Props should declare totalPages: number');
    assert.match(content, /basePath\s*:\s*string/, 'Props should declare basePath: string');
    assert.match(content, /params\s*\?/, 'Props should declare optional params');
  });

  it('renders the numbered join/join-item/btn-active pattern', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /class="join mt-4"/, 'should render the join container');
    assert.match(content, /join-item/, 'should render join-item buttons');
    assert.match(content, /btn-active/, 'should highlight the active page');
    assert.match(content, /Array\.from/, 'should iterate numbered pages');
  });

  it('preserves filter params in each link href (with page=N)', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /new URLSearchParams\(params\)/, 'should build qs from params');
    assert.match(content, /set\('page',/, 'should set page in the query string');
    assert.match(content, /basePath/, 'should build href from basePath');
  });

  it('is inert when totalPages <= 1', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /totalPages > 1/, 'should gate rendering on totalPages > 1');
  });
});
