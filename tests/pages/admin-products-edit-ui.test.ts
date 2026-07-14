import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAGE_PATH = resolve(__dirname, '../../src/pages/admin/products/[id].astro');

describe('Products edit page - card layout', () => {
  it('uses merchant-friendly role labels (Varies by / Product info), not dev jargon', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /Varies by/, 'role label "Varies by" must appear');
    assert.match(content, /Product info/, 'role label "Product info" must appear');
    assert.doesNotMatch(content, />Dimension</, 'the raw "Dimension" role label must be gone');
    assert.doesNotMatch(
      content,
      /<option value="field">Field<\//,
      'the raw "Field" role option label must be gone'
    );
  });

  it('Manage Variants matrix: no ReferenceError on product.slug, uses data-product-slug + computeMatrix', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    // Isolate the client <script> (the bug lives in client code, not frontmatter).
    const scriptStart = content.indexOf('<script>');
    const script = scriptStart >= 0 ? content.slice(scriptStart) : '';
    // Bug 1 fix: the client script must NOT reference the server-side `product` variable.
    assert.doesNotMatch(
      script,
      /product\.slug/,
      'client script must not reference server-side product.slug (ReferenceError bug)'
    );
    // Slug passed via a data attribute instead.
    assert.match(content, /data-product-slug/, 'form must expose data-product-slug for the client');
    // Uses the extracted, tested pure module.
    assert.match(
      script,
      /computeMatrix/,
      'must use the extracted computeMatrix from variant-matrix'
    );
    assert.match(
      script,
      /selectedCombinations/,
      'must use selectedCombinations to build the POST payload'
    );
    // Button renamed.
    assert.match(content, /Manage Variants/, 'button must be renamed to "Manage Variants"');
    // Existing variants rendered as exists/disabled, not re-creatable checkboxes.
    assert.match(script, /exists/, 'matrix must mark existing variants as exists');
  });

  it('does NOT have an offered-options subset step (one-click assignment)', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.doesNotMatch(
      content,
      /assign-options-container/,
      'the offered-options container must be removed'
    );
    assert.doesNotMatch(
      content,
      /assign-options-select/,
      'the offered-options multi-select must be removed'
    );
    assert.doesNotMatch(content, /Offered Options/, 'the "Offered Options" label must be removed');
  });

  it('variant edit modal includes price inputs per currency and per-variant custom fields', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    const script = content.slice(content.indexOf('<script>'));
    // Bug 5 fix: price inputs per currency with inherited placeholders.
    assert.match(script, /data-variant-price/, 'modal must render per-currency price inputs');
    assert.match(
      script,
      /inherited from product/,
      'price placeholder must show the inherited value'
    );
    assert.match(script, /body\.prices/, 'save handler must send prices in the PUT body');
    // Bug 3 fix: per-variant custom fields (field-role attributes).
    assert.match(script, /data-field-input/, 'modal must render per-variant custom field inputs');
    assert.match(script, /field_values/, 'save handler must send field_values in the PUT body');
  });

  it('variant edit modal does NOT re-fetch the whole variant list to find one variant (uses cache)', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    const script = content.slice(content.indexOf('<script>'));
    assert.match(script, /cachedVariants/, 'variant list must be cached');
    // The modal reads from the cache, not a per-open fetch of the variants list.
    assert.doesNotMatch(
      script,
      /openVariantEditModal[\s\S]*fetch\([^)]*\/variants`\)[\s\S]*find/,
      'modal must not fetch the variants list and filter to find one variant'
    );
  });

  it('product-level select-type custom fields are populated with options (not empty)', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    const script = content.slice(content.indexOf('<script>'));
    // Bug 2 fix: the old empty `<select ...><option value="">Select...</option></select>`
    // (no options loaded) must be gone — loadCustomFields now fetches options.
    assert.doesNotMatch(
      script,
      /<select class="select select-bordered" data-field-value="\$\{f\.assignment_id\}"><option value="">Select\.\.\.<\/option><\/select>/,
      'the empty select-type custom field (no options loaded) must be gone'
    );
    // Select-type fields fetch the attribute options and pre-select by option_id.
    assert.match(
      script,
      /data-field-kind="select"/,
      'select-type custom fields must be tagged data-field-kind=select'
    );
    assert.match(script, /f\.option_id === o\.id/, 'current option_id must be pre-selected');
    // The save handler sends option_id for selects (not value_text).
    assert.match(
      script,
      /option_id: \(el as HTMLSelectElement\)\.value/,
      'save handler must send option_id for select-type fields'
    );
  });

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
    assert.match(
      content,
      /flex justify-end gap-2 pt-4 border-t border-base-200/,
      'Save button should be right-justified'
    );
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

  it('uses SearchSelect for category_id field', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.match(content, /<SearchSelect/, 'Should use SearchSelect component for category field');
    assert.doesNotMatch(
      content,
      /<SelectField name="category_id"/,
      'Should NOT use SelectField for category_id (replaced by SearchSelect)'
    );
  });
});
