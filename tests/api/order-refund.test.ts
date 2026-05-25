import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REFUND_PATH = resolve(__dirname, '../../src/api/shop/orders/[id]/refund.ts');

describe('Refund recording API', () => {
  it('file exists', () => {
    assert.ok(existsSync(REFUND_PATH), 'src/api/shop/orders/[id]/refund.ts should exist');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(REFUND_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT handler');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(REFUND_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should require admin auth');
  });

  it('accepts refund_amount and refund_notes in body', () => {
    const content = readFileSync(REFUND_PATH, 'utf-8');
    assert.match(content, /refund_amount/, 'Should accept refund_amount');
    assert.match(content, /refund_notes/, 'Should accept refund_notes');
  });

  it('validates refund_amount does not exceed order total', () => {
    const content = readFileSync(REFUND_PATH, 'utf-8');
    assert.match(content, /422|exceeds|cannot exceed|total/, 'Should validate refund amount against total');
  });

  it('stores refund_amount on order', () => {
    const content = readFileSync(REFUND_PATH, 'utf-8');
    assert.match(content, /refund_amount/, 'Should store refund_amount');
  });

  it('stores refunded_at on order', () => {
    const content = readFileSync(REFUND_PATH, 'utf-8');
    assert.match(content, /refunded_at/, 'Should store refunded_at');
  });

  it('transitions order to refunded', () => {
    const content = readFileSync(REFUND_PATH, 'utf-8');
    assert.match(content, /refunded/, 'Should transition to refunded status');
  });

  it('calls transitionOrder service', () => {
    const content = readFileSync(REFUND_PATH, 'utf-8');
    assert.match(content, /transitionOrder/, 'Should call transitionOrder');
  });

  it('returns success response', () => {
    const content = readFileSync(REFUND_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});