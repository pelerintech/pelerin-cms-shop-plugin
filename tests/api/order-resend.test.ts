import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RESEND_PATH = resolve(__dirname, '../../src/api/shop/orders/[id]/resend.ts');

describe('Resend confirmation stub API', () => {
  it('file exists', () => {
    assert.ok(existsSync(RESEND_PATH), 'src/api/shop/orders/[id]/resend.ts should exist');
  });

  it('exports POST handler', () => {
    const content = readFileSync(RESEND_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(RESEND_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should require admin auth');
  });

  it('returns stub message about email not configured', () => {
    const content = readFileSync(RESEND_PATH, 'utf-8');
    assert.match(content, /Email notifications not yet configured|not yet configured/, 'Should return not-configured stub');
  });

  it('returns success true', () => {
    const content = readFileSync(RESEND_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });

  it('includes TODO comment for CMS event bus', () => {
    const content = readFileSync(RESEND_PATH, 'utf-8');
    assert.match(content, /TODO|event.bus|emit/, 'Should include TODO for future event bus');
  });
});