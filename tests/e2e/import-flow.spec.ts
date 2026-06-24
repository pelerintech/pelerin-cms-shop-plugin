import { test, expect, type Page } from '@playwright/test';

/**
 * Tier 4 E2E for the bulk import hub (Request shop-r7-bulk-import, Task 11).
 *
 * This is the ONLY tier that executes the client `<script>` in
 * src/pages/admin/import/index.astro, so it is the only thing that proves the
 * upload forms, the fetch() calls to the import endpoints, and the
 * renderResult() DOM rendering actually work in a browser. It closes the
 * 2026-06-24 evaluation gap that flagged the Admin UI capability as PARTIAL
 * for lacking E2E coverage of the upload / result / all-errors flows.
 *
 * Admin credentials come from the CMS seed (admin@pelerin.local / 123456789).
 * Run against the CMS dev server on :3000 (see playwright.config.ts).
 */

const ADMIN_EMAIL = process.env.SHOP_E2E_ADMIN_EMAIL ?? 'admin@pelerin.local';
const ADMIN_PASSWORD = process.env.SHOP_E2E_ADMIN_PASSWORD ?? '123456789';

async function adminLogin(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/admin/**', { timeout: 20_000 });
}

test('import hub renders both upload forms and Download Template links', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/admin/plugins/shop/import');

  await expect(page.locator('#products-form')).toBeVisible();
  await expect(page.locator('#prices-form')).toBeVisible();
  await expect(page.getByRole('link', { name: /Download Template/i }).first()).toBeVisible();
  // Two template download anchors, one per form.
  await expect(page.locator('a[download="products-template.csv"]')).toBeVisible();
  await expect(page.locator('a[download="prices-template.csv"]')).toBeVisible();
});

test('uploading a valid product CSV shows a result summary with created count', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/admin/plugins/shop/import');

  // Unique SKU so the row is CREATED (not updated) regardless of prior runs.
  const sku = `E2E-IMP-${Date.now()}`;
  const csv = `sku,name_ro,name_en,description_ro,description_en,type,category_slug,vat_rate,stock\n` +
    `${sku},Produs E2E,E2E Product,Desc,Desc,physical,carti,0.09,10\n`;

  const fileInput = page.locator('#products-file');
  await fileInput.setInputFiles({
    name: 'products.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });
  await page.locator('#products-form button[type="submit"]').click();

  // renderResult() unhides #products-result and writes the summary — proving
  // the client script ran the fetch + DOM render past parse time.
  const result = page.locator('#products-result');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result.getByText(/Import complete/i)).toBeVisible();
  await expect(result.getByText(/Created: 1/)).toBeVisible();
});

test('uploading an all-errors product CSV shows 0 created and lists row errors', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/admin/plugins/shop/import');

  // Every row is invalid: missing sku, invalid type, non-existent category.
  const csv = `sku,name_ro,name_en,description_ro,description_en,type,category_slug,vat_rate,stock\n` +
    `,Fara SKU,,Desc,Desc,physical,carti,0.09,5\n` +
    `BAD-TYPE,Rau Tip,,Desc,Desc,widget,carti,0.09,5\n` +
    `BAD-CAT,Rau Cat,,Desc,Desc,physical,nonexistent-category-xyz,0.09,5\n`;

  await page.locator('#products-file').setInputFiles({
    name: 'products-bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });
  await page.locator('#products-form button[type="submit"]').click();

  const result = page.locator('#products-result');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result.getByText(/Import complete/i)).toBeVisible();
  // 0 created, 3 row errors listed. The page must not crash or stay blank.
  await expect(result.getByText(/Created: 0/)).toBeVisible();
  await expect(result.getByText(/3 row error\(s\)/i)).toBeVisible();
  await expect(result.getByText(/Row 2/)).toBeVisible();
  await expect(result.getByText(/Row 3/)).toBeVisible();
  await expect(result.getByText(/Row 4/)).toBeVisible();
});

test('uploading a valid price CSV shows a result summary with updated count', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/admin/plugins/shop/import');

  // BOOK-001 is seeded with RON + EUR prices — this upserts (updates) the RON row.
  const csv = `sku,currency,price_net\n` +
    `BOOK-001,RON,9999\n`;

  await page.locator('#prices-file').setInputFiles({
    name: 'prices.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });
  await page.locator('#prices-form button[type="submit"]').click();

  const result = page.locator('#prices-result');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result.getByText(/Import complete/i)).toBeVisible();
  await expect(result.getByText(/Updated: 1/)).toBeVisible();
});
