import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATUS_PATH = resolve(__dirname, '../../src/api/shop/orders/[id]/status.ts');

describe('Order status transition API', () => {
  it('file exists', () => {
    assert.ok(existsSync(STATUS_PATH), 'src/api/shop/orders/[id]/status.ts should exist');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(STATUS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT handler');
  });

  it('uses APIRoute type', () => {
    const content = readFileSync(STATUS_PATH, 'utf-8');
    assert.match(content, /APIRoute/, 'Should use APIRoute type');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(STATUS_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should require admin auth');
  });

  it('calls transitionOrder service', () => {
    const content = readFileSync(STATUS_PATH, 'utf-8');
    assert.match(content, /transitionOrder/, 'Should call transitionOrder');
  });

  it('accepts status and note in request body', () => {
    const content = readFileSync(STATUS_PATH, 'utf-8');
    assert.match(content, /status/, 'Should accept status in body');
    assert.match(content, /note/, 'Should accept note in body');
  });

  it('returns updated order on success', () => {
    const content = readFileSync(STATUS_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });

  it('returns 409 for invalid transitions', () => {
    const content = readFileSync(STATUS_PATH, 'utf-8');
    assert.match(content, /409|Invalid.*transition|Invalid status/, 'Should return 409 for invalid transition');
  });

  it('validates body with Zod or manual check', () => {
    const content = readFileSync(STATUS_PATH, 'utf-8');
    assert.match(content, /zod|safeParse|schema|validate/, 'Should validate request body');
  });
});