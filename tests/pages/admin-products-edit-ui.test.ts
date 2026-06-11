import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAGE_PATH = resolve(__dirname, '../../src/pages/admin/products/[id].astro');

describe('Products edit page - card layout', () => {
  it('imports Breadcrumbs component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /Breadcrumbs/, 'Should import Breadcrumbs component');
  });

  it('has breadcrumbs with Shop > Products > Edit', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /Shop/, 'Breadcrumbs should include Shop');
    assert.match(content, /Products/, 'Breadcrumbs should include Products');
    assert.match(content, /Edit/, 'Breadcrumbs should include Edit');
  });

  it('uses TextField component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /TextField/, 'Should use TextField component');
  });

  it('uses SelectField component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /SelectField/, 'Should use SelectField component');
  });

  it('uses CheckboxField component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /CheckboxField/, 'Should use CheckboxField component');
  });

  it('uses RichTextEditor component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /RichTextEditor/, 'Should use RichTextEditor component');
  });

  it('uses ImageUpload component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /ImageUpload/, 'Should use ImageUpload component');
  });

  it('save button is right-justified with border-t', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /flex justify-end gap-2 pt-4 border-t border-base-200/, 'Save button should be right-justified');
  });

  it('page uses single card with sectioned layout', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    const outerCards = content.match(/card bg-base-100 shadow-lg col-span-12/g);
    assert.ok(outerCards && outerCards.length === 1, 'Should have exactly 1 outer card');
    const sectionCards = content.match(/card bg-base-200\/50/g);
    assert.ok(sectionCards && sectionCards.length >= 3, 'Should have at least 3 section cards');
  });

  it('reads locales from shop_settings', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /locales/, 'Should read locales from shop_settings');
  });

  it('reads currencies from shop_settings', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /currencies/, 'Should read currencies from shop_settings');
  });

  it('has price add modal', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /price-modal/, 'Should have price modal dialog');
  });

  it('no longer has tabs or variant/translation sections', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.doesNotMatch(content, /tab ===/, 'Should not have tab-based routing');
    assert.doesNotMatch(content, /create-variant-form/, 'Should not have variant creation');
  });
});