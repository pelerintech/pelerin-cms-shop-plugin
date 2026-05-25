import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXPORT_PATH = resolve(__dirname, '../../src/api/shop/orders/export.ts');

describe('CSV export API', () => {
  it('file exists', () => {
    assert.ok(existsSync(EXPORT_PATH), 'src/api/shop/orders/export.ts should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(EXPORT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(EXPORT_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should require admin auth');
  });

  it('returns text/csv content type', () => {
    const content = readFileSync(EXPORT_PATH, 'utf-8');
    assert.match(content, /text\/csv/, 'Should return text/csv content type');
  });

  it('sets Content-Disposition header', () => {
    const content = readFileSync(EXPORT_PATH, 'utf-8');
    assert.match(content, /Content-Disposition|attachment/, 'Should set Content-Disposition header');
  });

  it('sets filename in Content-Disposition', () => {
    const content = readFileSync(EXPORT_PATH, 'utf-8');
    assert.match(content, /filename/, 'Should include filename in Content-Disposition');
  });

  it('includes CSV header row with all columns', () => {
    const content = readFileSync(EXPORT_PATH, 'utf-8');
    assert.match(content, /order_number|created_at|status|customer_name|customer_email/, 'Should have essential CSV columns');
  });

  it('respects status filter from query params', () => {
    const content = readFileSync(EXPORT_PATH, 'utf-8');
    assert.match(content, /status|filter/, 'Should support status filter');
  });

  it('does not apply pagination limit', () => {
    const content = readFileSync(EXPORT_PATH, 'utf-8');
    // Should NOT have a LIMIT that restricts results — export should get ALL matching
    assert.doesNotMatch(content, /LIMIT\s+\d+|OFFSET/, 'Should not use pagination limits');
  });
});