import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMPONENT_PATH = resolve(__dirname, '../../../src/components/admin/SelectField.astro');

describe('SelectField component', () => {
  it('file exists', () => {
    assert.ok(existsSync(COMPONENT_PATH), 'src/components/admin/SelectField.astro should exist');
  });

  it('renders form-control wrapper', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /form-control/, 'Should use form-control wrapper class');
  });

  it('renders select with select-bordered class', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /<select/, 'Should have a select element');
    assert.match(content, /select-bordered/, 'Should have select-bordered class');
    assert.match(content, /w-full/, 'Should have w-full class');
  });

  it('generates options from options prop', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /options/, 'Should reference options prop');
    assert.match(content, /\.map/, 'Should iterate over options');
    assert.match(content, /<option/, 'Should render option elements');
  });

  it('has a placeholder first option', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    // The placeholder is the first option with empty value
    assert.match(content, /placeholder/, 'Should support placeholder prop');
    assert.match(content, /value=""/, 'Should have empty value placeholder option');
  });

  it('supports value prop for pre-selection', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /selected/, 'Should support selected attribute');
  });

  it('supports error prop with select-error class and data-field', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /select-error/, 'Should use select-error class for validation errors');
    assert.match(content, /data-field/, 'Should have data-field attribute for client JS targeting');
  });

  it('renders label', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /label-text/, 'Should have label element');
  });
});