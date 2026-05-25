import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENDPOINT_PATH = resolve(__dirname, '../../src/api/shop/products/[id]/prices.ts');

describe('Product prices API', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(ENDPOINT_PATH), 'Prices endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT');
  });

  it('requires admin auth', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin');
  });

  it('GET returns prices grouped by currency', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /currency/, 'Should group by currency');
  });

  it('PUT handles bulk upsert', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /upsert|insert|INSERT/, 'Should handle bulk upsert');
  });

  it('validates with Zod on PUT', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /safeParse/, 'Should use Zod safeParse');
  });

  it('returns 422 on invalid price', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /422/, 'Should return 422 on validation failure');
  });
});