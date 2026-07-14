import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tier 3 static assertion: the admin edit pages for categories and products
 * contain an alert-warning block whose presence is conditional on a
 * slugCollisions variable, AND the frontmatter calls a findSlugCollisions
 * accessor.
 *
 * This is a source-level check (honest: it proves the strings are present in
 * the .astro file). Runtime behavior is Tier 4 (Playwright), out of scope here.
 */

const adminDir = join(import.meta.dirname, '..', '..', 'src', 'pages', 'admin');

test('category [id].astro frontmatter calls findSlugCollisions', () => {
  const src = readFileSync(join(adminDir, 'categories', '[id].astro'), 'utf-8');
  assert.ok(
    src.includes('findSlugCollisions'),
    'category edit page should call findSlugCollisions in frontmatter'
  );
});

test('category [id].astro renders alert-warning when slugCollisions is non-empty', () => {
  const src = readFileSync(join(adminDir, 'categories', '[id].astro'), 'utf-8');
  assert.ok(
    src.includes('alert-warning') && src.includes('slugCollisions'),
    'category edit page should render alert-warning conditionally on slugCollisions'
  );
});

test('product [id].astro frontmatter calls findSlugCollisions', () => {
  const src = readFileSync(join(adminDir, 'products', '[id].astro'), 'utf-8');
  assert.ok(
    src.includes('findSlugCollisions'),
    'product edit page should call findSlugCollisions in frontmatter'
  );
});

test('product [id].astro renders alert-warning when slugCollisions is non-empty', () => {
  const src = readFileSync(join(adminDir, 'products', '[id].astro'), 'utf-8');
  assert.ok(
    src.includes('alert-warning') && src.includes('slugCollisions'),
    'product edit page should render alert-warning conditionally on slugCollisions'
  );
});
