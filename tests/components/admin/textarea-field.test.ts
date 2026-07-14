import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMPONENT_PATH = resolve(__dirname, '../../../src/components/admin/TextareaField.astro');

describe('TextareaField component', () => {
  it('file exists', () => {
    assert.ok(existsSync(COMPONENT_PATH), 'src/components/admin/TextareaField.astro should exist');
  });

  it('renders form-control wrapper', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /form-control/, 'Should use form-control wrapper class');
  });

  it('renders textarea with textarea-bordered class', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /<textarea/, 'Should have a textarea element');
    assert.match(content, /textarea-bordered/, 'Should have textarea-bordered class');
    assert.match(content, /w-full/, 'Should have w-full class');
  });

  it('renders with default h-24 class', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    // Uses template literal h-${rows} with rows defaulting to 24
    assert.match(content, /rows = 24/, 'Should default rows to 24');
    assert.match(content, /h-/, 'Should have height class pattern');
  });

  it('supports rows prop for height class', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /rows/, 'Should reference rows prop for height');
  });

  it('supports error prop with textarea-error and data-field', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /textarea-error/, 'Should have textarea-error class for errors');
    assert.match(content, /data-field/, 'Should have data-field attribute for client JS');
  });

  it('renders label', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /label-text/, 'Should have label-text class');
  });
});
