/**
 * Task 36 — Admin euPlatesc settings page: 4 fields, no test mode, diagnostic section.
 *
 * The page source must contain:
 * - Input fields for all 4 credential keys
 * - NO euplatesc_test_mode checkbox
 * - "Test Connection" button
 * - "Create Test Payment" button
 * - #test-result display element
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, '../../src/pages/admin/settings/payments/euplatesc.astro');

function getPageSource(): string {
  return fs.readFileSync(PAGE_PATH, 'utf-8');
}

test('has input for euplatesc_merchant_id', () => {
  const source = getPageSource();
  assert.match(source, /id="euplatesc_merchant_id"/, 'should have merchant_id input');
});

test('has input for euplatesc_secret_key', () => {
  const source = getPageSource();
  assert.match(source, /id="euplatesc_secret_key"/, 'should have secret_key input');
});

test('has input for euplatesc_ukey', () => {
  const source = getPageSource();
  assert.match(source, /id="euplatesc_ukey"/, 'should have ukey input');
});

test('has input for euplatesc_uapi_key', () => {
  const source = getPageSource();
  assert.match(source, /id="euplatesc_uapi_key"/, 'should have uapi_key input');
});

test('does NOT have euplatesc_test_mode checkbox', () => {
  const source = getPageSource();
  assert.doesNotMatch(source, /euplatesc_test_mode/, 'should not have test_mode checkbox');
});

test('has Test Connection button', () => {
  const source = getPageSource();
  assert.match(source, /Test Connection/i, 'should have Test Connection button');
});

test('has Create Test Payment button', () => {
  const source = getPageSource();
  assert.match(source, /Create Test Payment/i, 'should have Create Test Payment button');
});

test('has #test-result display element', () => {
  const source = getPageSource();
  assert.match(source, /id="test-result"/, 'should have test-result display element');
});
