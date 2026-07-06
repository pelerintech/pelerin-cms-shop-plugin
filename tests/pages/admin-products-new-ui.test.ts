import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAGE_PATH = resolve(__dirname, '../../src/pages/admin/products/new.astro');

describe('Products new page - card layout', () => {
  it('does NOT render a has_variants checkbox (derived at read, not user input)', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.doesNotMatch(content, /name="has_variants"/, 'has_variants checkbox must be removed (derived, not input)');
    assert.doesNotMatch(content, /Has variants/, 'has_variants label must be removed');
  });

  it('imports Breadcrumbs component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /Breadcrumbs/, 'Should import Breadcrumbs component');
  });

  it('has breadcrumbs with Shop > Products > New Product', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /Shop/, 'Breadcrumbs should include Shop');
    assert.match(content, /Products/, 'Breadcrumbs should include Products');
    assert.match(content, /New Product/, 'Breadcrumbs should include New Product');
  });

  it('form is wrapped in card with shadow-lg', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /card bg-base-100 shadow-lg/, 'Form should be in single outer card');
    assert.match(content, /card-body/, 'Card should have card-body');
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

  it('uses TextareaField component', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    // Descriptions use RichTextEditor instead of TextareaField
    assert.match(content, /RichTextEditor/, 'Should use RichTextEditor component for descriptions');
  });

  it('submit button is right-justified with border-t', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /flex justify-end gap-2 pt-4 border-t border-base-200/, 'Submit button area should be right-justified with border');
  });

  it('still has data-field error spans for client JS', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /data-field/, 'Should still have data-field attributes for client JS');
  });

  it('still has form-error alert div', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /form-error/, 'Should still have form-error alert div');
  });

  it('uses SearchSelect for category_id field', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /<SearchSelect/, 'Should use SearchSelect component for category field');
    assert.doesNotMatch(content, /<SelectField name="category_id"/, 'Should NOT use SelectField for category_id (replaced by SearchSelect)');
  });
});