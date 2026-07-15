import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMPONENT_PATH = resolve(__dirname, '../../../src/components/admin/Breadcrumbs.astro');

describe('Breadcrumbs component', () => {
  it('file exists', () => {
    assert.ok(existsSync(COMPONENT_PATH), 'src/components/admin/Breadcrumbs.astro should exist');
  });

  it('has breadcrumbs class and col-span-12', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /breadcrumbs/, 'Should have breadcrumbs class');
    assert.match(content, /col-span-12/, 'Should have col-span-12 for full-width grid');
  });

  it('maps over Astro.props.items', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    // Astro components access props via Astro.props, destructure, or interface Props
    assert.match(content, /items/, 'Should reference items from props');
    assert.match(content, /\.map/, 'Should iterate over items');
  });

  it('renders link items with <a> tag', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /<a/, 'Should render <a> tags for link items');
    assert.match(content, /href/, 'Should use href attribute');
  });

  it('renders last item as plain text (no link)', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    // The last item should be rendered without an <a> tag — check for logic
    // that distinguishes last item via index comparison
    assert.match(content, /isLast|index.*length|last/, 'Should have logic for last item detection');
  });

  it('wraps in <ul>', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /<ul/, 'Should wrap items in <ul>');
  });
});
