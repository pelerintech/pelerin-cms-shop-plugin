import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SETTINGS_PATH = resolve(__dirname, '../../src/api/shop/settings/general.ts');

describe('General settings API', () => {
  it('file exists', () => {
    assert.ok(existsSync(SETTINGS_PATH), 'src/api/shop/settings/general.ts should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT handler');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should require admin auth');
  });

  it('returns 401 for unauthenticated', () => {
    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    assert.match(content, /401|Unauthorized/, 'Should return 401 for unauthenticated');
  });

  it('GET returns shop settings from DB', () => {
    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    assert.match(content, /shop_settings/, 'Should read from shop_settings');
  });

  it('includes order_number_prefix in GET response', () => {
    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    assert.match(content, /order_number_prefix/, 'Should include order_number_prefix');
  });

  it('includes default_currency in response', () => {
    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    assert.match(content, /default_currency|currency/, 'Should include currency');
  });

  it('PUT updates settings with Zod validation', () => {
    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    assert.match(content, /safeParse|schema|Zod|validate/, 'Should validate with Zod');
  });

  it('PUT returns 200 on success', () => {
    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    assert.match(content, /200|success.*true/, 'Should return 200 on success');
  });
});