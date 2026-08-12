/**
 * Unit tests for `src/lib/client/attribute-form.ts` — the extracted, pure,
 * DOM-free attribute-form payload/response logic (Task 1 of shop-r34). These
 * run under bare `node --test` (no browser, no server, no Astro) because every
 * function is a pure transform over a plain fields object.
 *
 * The `<script>` blocks in the attribute pages become thin callers of these
 * functions (exercised by the page's esbuild/plain-JS guards), so this module
 * keeps the payload-building and response-handling logic unit-testable.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttributeSavePayload,
  buildAttributeUpdatePayload,
  buildAttributeOptionPayload,
  attributeFormResponse,
} from '../../../src/lib/client/attribute-form.ts';

describe('buildAttributeSavePayload', () => {
  it('maps default-locale name, type, parsed sort_order, and per-locale translations', () => {
    const out = buildAttributeSavePayload(
      { name: 'Color', type: 'select', sort_order: '2', name_en: 'Colour' },
      { defaultLocale: 'ro', otherLocaleCodes: ['en'] }
    );
    assert.deepEqual(out, {
      name: 'Color',
      type: 'select',
      sort_order: 2,
      translations: { en: 'Colour' },
    });
  });

  it('omits empty per-locale names from translations', () => {
    const out = buildAttributeSavePayload(
      { name: 'Color', type: 'select', sort_order: '0', name_en: '' },
      { defaultLocale: 'ro', otherLocaleCodes: ['en'] }
    );
    assert.deepEqual(out.translations, {});
  });

  it('coerces blank or non-numeric sort_order to 0', () => {
    const a = buildAttributeSavePayload(
      { name: 'A', type: 'text', sort_order: '' },
      { defaultLocale: 'ro', otherLocaleCodes: [] }
    );
    const b = buildAttributeSavePayload(
      { name: 'B', type: 'text', sort_order: 'not-a-number' },
      { defaultLocale: 'ro', otherLocaleCodes: [] }
    );
    assert.equal(a.sort_order, 0);
    assert.equal(b.sort_order, 0);
  });
});

describe('buildAttributeUpdatePayload', () => {
  it('excludes the type key and parses sort_order (edit-form parity)', () => {
    const out = buildAttributeUpdatePayload({
      name: 'Color',
      type: 'select',
      sort_order: '3',
      name_en: 'Colour',
    });
    assert.equal(out.type, undefined);
    assert.equal(out.sort_order, 3);
    assert.equal(out.name, 'Color');
    assert.equal(out.name_en, 'Colour');
  });
});

describe('buildAttributeOptionPayload', () => {
  it('returns value, label, and parsed sort_order', () => {
    assert.deepEqual(buildAttributeOptionPayload({ value: 'red', label: 'Red', sort_order: '1' }), {
      value: 'red',
      label: 'Red',
      sort_order: 1,
    });
  });

  it('coerces sort_order to 0 when blank', () => {
    assert.deepEqual(buildAttributeOptionPayload({ value: 'red', label: 'Red', sort_order: '' }), {
      value: 'red',
      label: 'Red',
      sort_order: 0,
    });
  });
});

describe('attributeFormResponse', () => {
  it('maps a successful create response to ok + redirectId', () => {
    assert.deepEqual(attributeFormResponse({ success: true, data: { id: 'abc' } }), {
      ok: true,
      redirectId: 'abc',
      errorMessage: null,
      fieldErrors: {},
    });
  });

  it('maps a failed response to errorMessage + fieldErrors', () => {
    assert.deepEqual(
      attributeFormResponse({ success: false, error: 'boom', fields: { name: 'x' } }),
      { ok: false, errorMessage: 'boom', fieldErrors: { name: 'x' }, redirectId: null }
    );
  });

  it('falls back to a generic message when no error is supplied', () => {
    const out = attributeFormResponse({ success: false });
    assert.equal(out.ok, false);
    assert.equal(out.errorMessage, 'Unknown error');
  });
});
