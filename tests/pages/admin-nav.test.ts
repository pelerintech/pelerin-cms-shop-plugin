import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MANIFEST_PATH = resolve(__dirname, '../../pelerin.manifest.json');

describe('Admin nav manifest entries', () => {
  // GREEN assertions — confirm entries are present
  it('manifest has adminPages entry for /admin/plugins/shop', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const dashboardEntry = manifest.adminPages.find(
      (p: any) => p.pattern === '/admin/plugins/shop'
    );
    assert.ok(dashboardEntry, 'Manifest should have dashboard adminPages entry');
    assert.strictEqual(dashboardEntry.entrypoint, './src/pages/admin/index.astro', 'Dashboard should point to index.astro');
  });

  it('navItems has Products entry', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const entry = manifest.navItems.find((n: any) => n.label === 'Products');
    assert.ok(entry, 'navItems should have Products entry');
    assert.strictEqual(entry.href, '/admin/plugins/shop/products', 'Products should link to correct path');
    assert.ok(entry.icon, 'Products should have an icon');
  });

  it('navItems has Categories entry', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const entry = manifest.navItems.find((n: any) => n.label === 'Categories');
    assert.ok(entry, 'navItems should have Categories entry');
    assert.strictEqual(entry.href, '/admin/plugins/shop/categories', 'Categories should link to correct path');
    assert.ok(entry.icon, 'Categories should have an icon');
  });

  it('Products appears before Orders in navItems', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const productsIdx = manifest.navItems.findIndex((n: any) => n.label === 'Products');
    const ordersIdx = manifest.navItems.findIndex((n: any) => n.label === 'Orders');
    assert.ok(productsIdx < ordersIdx, 'Products should come before Orders');
  });

  it('Categories appears before Orders in navItems', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const categoriesIdx = manifest.navItems.findIndex((n: any) => n.label === 'Categories');
    const ordersIdx = manifest.navItems.findIndex((n: any) => n.label === 'Orders');
    assert.ok(categoriesIdx < ordersIdx, 'Categories should come before Orders');
  });

  it('existing nav items are preserved', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const labels = manifest.navItems.map((n: any) => n.label);
    assert.ok(labels.includes('Shop'), 'Shop nav item should still exist');
    assert.ok(labels.includes('Orders'), 'Orders nav item should still exist');
    assert.ok(labels.includes('Vouchers'), 'Vouchers nav item should still exist');
    assert.ok(labels.includes('Referral Codes'), 'Referral Codes nav item should still exist');
    assert.ok(labels.includes('Carts'), 'Carts nav item should still exist');
    assert.ok(labels.includes('Payments'), 'Payments nav item should still exist');
    assert.ok(labels.includes('Settings'), 'Settings nav item should still exist');
  });
});