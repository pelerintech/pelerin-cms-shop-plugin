import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMPONENT_PATH = resolve(__dirname, '../../../src/components/admin/TextField.astro');

describe('TextField component', () => {
  it('file exists', () => {
    assert.ok(existsSync(COMPONENT_PATH), 'src/components/admin/TextField.astro should exist');
  });

  it('renders form-control wrapper', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /form-control/, 'Should use form-control wrapper class');
  });

  it('renders label with class label', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /label/, 'Should have a label element');
  });

  it('renders input with input-bordered class', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /input/, 'Should have an input element');
    assert.match(content, /input-bordered/, 'Should have input-bordered class');
    assert.match(content, /w-full/, 'Should have w-full class');
  });

  it('supports required prop with red asterisk', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /required/, 'Should support required prop');
    assert.match(content, /text-error/, 'Should have text-error for required asterisk');
  });

  it('supports error prop with data-field attribute', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /error/, 'Should reference error prop');
    assert.match(content, /data-field/, 'Should have data-field attribute for client JS targeting');
  });

  it('supports type prop (for number inputs)', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /type/, 'Should support type prop');
  });

  it('supports value and placeholder props', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /value/, 'Should support value prop');
    assert.match(content, /placeholder/, 'Should support placeholder prop');
  });
});