/**
 * Tier 3 source-structure tests for the admin attribute forms.
 *
 * These assert the forms collect the fields that populate the unified
 * attribute shape (per-locale attribute name, per-option canonical `value` and
 * per-locale `label`) and that the client script wires the persistence payloads
 * (translations for names/labels, and opts passed to the payload builders).
 * Note (Tier 3 convention): these are static source assertions, not runtime
 * behavior — runtime form behavior is Tier 4 and out of scope.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

function read(p: string): string {
  return readFileSync(join(root, p), 'utf8');
}

test('new.astro collects per-locale name fields and wires buildAttributeSavePayload', () => {
  const src = read('src/pages/admin/settings/attributes/new.astro');
  assert.match(src, /name=\{`name_\$\{locale\.code\}`\}/, 'per-locale name field present');
  assert.match(src, /buildAttributeSavePayload\(fields/, 'create payload builder wired');
  assert.match(src, /defaultLocale/, 'script passes locale opts');
});

test('[id].astro collects per-option value + per-locale label and wires the persistence payloads', () => {
  const src = read('src/pages/admin/settings/attributes/[id].astro');
  // Option add form: canonical value + default label + per-locale labels.
  assert.match(src, /name="value"/, 'canonical option value field present');
  assert.match(src, /name="label"/, 'default-locale option label field present');
  assert.match(src, /name=\{`label_\$\{locale\.code\}`\}/, 'per-locale option label field present');
  // Client script passes locale opts to both payload builders so translations persist.
  assert.match(
    src,
    /buildAttributeOptionPayload\(\s*fields\s*,\s*formOpts\s*\)/,
    'option payload builder receives locale opts'
  );
  assert.match(
    src,
    /buildAttributeUpdatePayload\(\s*fields\s*,\s*formOpts\s*\)/,
    'update payload builder receives locale opts'
  );
  // Duplicate-value error surfaces in the option alert.
  assert.match(src, /option-error-text/, 'option error alert id present');
});

test('attribute-form client lib exports the transformers the pages bind', () => {
  const src = read('src/lib/client/attribute-form.ts');
  assert.match(src, /export function buildAttributeUpdatePayload/, 'update payload fn');
  assert.match(src, /export function buildAttributeOptionPayload/, 'option payload fn');
  assert.match(src, /translations/, 'builds a translations map');
});
