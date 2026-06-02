import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMPONENT_PATH = resolve(__dirname, '../../../src/components/admin/CheckboxField.astro');

describe('CheckboxField component', () => {
  it('file exists', () => {
    assert.ok(existsSync(COMPONENT_PATH), 'src/components/admin/CheckboxField.astro should exist');
  });

  it('renders label with cursor-pointer and justify-start', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /cursor-pointer/, 'Should have cursor-pointer class');
    assert.match(content, /justify-start/, 'Should have justify-start class');
  });

  it('renders checkbox input', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /type="checkbox"/, 'Should have type="checkbox"');
    assert.match(content, /checkbox/, 'Should have checkbox class');
  });

  it('supports checked prop', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /checked/, 'Should reference checked prop');
  });

  it('supports name and label props', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /name/, 'Should have a name prop');
    assert.match(content, /label/, 'Should have a label prop');
  });

  it('renders label-text', () => {
    const content = readFileSync(COMPONENT_PATH, 'utf-8');
    assert.match(content, /label-text/, 'Should have label-text class');
  });
});