import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DASHBOARD_PATH = resolve(__dirname, '../../src/pages/admin/index.astro');
const MANIFEST_PATH = resolve(__dirname, '../../pelerin.manifest.json');

describe('Admin dashboard page', () => {
  // GREEN assertions — confirm the dashboard page exists and is correct
  it('dashboard page file exists', () => {
    assert.ok(existsSync(DASHBOARD_PATH), 'src/pages/admin/index.astro should exist');
  });

  it('uses AdminLayout', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /AdminLayout/, 'Should use AdminLayout');
  });

  it('uses requireAdmin for auth', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should require admin auth');
  });

  it('has col-span-12 on top-level wrapper', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /col-span-12/, 'Should use col-span-12 for full-width grid');
  });

  it('links to products section', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /\/admin\/plugins\/shop\/products/, 'Should link to products');
  });

  it('links to orders section', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /\/admin\/plugins\/shop\/orders/, 'Should link to orders');
  });

  it('links to vouchers section', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /\/admin\/plugins\/shop\/vouchers/, 'Should link to vouchers');
  });

  it('links to categories section', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /\/admin\/plugins\/shop\/categories/, 'Should link to categories');
  });

  it('links to carts section', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /\/admin\/plugins\/shop\/carts/, 'Should link to carts');
  });

  it('links to payments settings', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /\/admin\/plugins\/shop\/settings\/payments/, 'Should link to payments');
  });

  it('links to general settings', () => {
    const content = readFileSync(DASHBOARD_PATH, 'utf-8');
    assert.match(content, /\/admin\/plugins\/shop\/settings\/general/, 'Should link to settings');
  });
});