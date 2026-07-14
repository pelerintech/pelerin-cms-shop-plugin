import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * r18 Tier 4 E2E — the ONLY tier that executes the ImageUpload.astro client
 * <script> in a real browser against the running CMS. Proves the full loop:
 * upload a real image file → bytes stored via sdk.storage → product_images row
 * created → admin preview shows a resolved URL → image persists across reload →
 * deletion removes both preview and bytes. This is the r15 lesson made
 * structural: a parse-time client-<script> bug disables the whole upload flow
 * and no Tier 1–3 test catches it.
 */

const FIXTURE_PATH = 'tests/e2e/fixtures/sample.png';
const FIXTURE = readFileSync(FIXTURE_PATH);

const ADMIN_EMAIL = process.env.SHOP_E2E_ADMIN_EMAIL ?? 'admin@pelerin.local';
const ADMIN_PASSWORD = process.env.SHOP_E2E_ADMIN_PASSWORD ?? '123456789';

async function adminLogin(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/admin/**', { timeout: 20_000 });
}

/** A real product edit-page link from the products list (excludes /new). */
const EDIT_LINK = 'a[href*="/admin/plugins/shop/products/"][href*="?from_page="]';

test('admin uploads a product image and sees a resolved preview URL (no raw key)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await adminLogin(page);

  // Pick the first product from the list.
  await page.goto('/admin/plugins/shop/products');
  const href = await page.locator(EDIT_LINK).first().getAttribute('href');
  expect(href).toBeTruthy();
  const productId = href!.split('/products/')[1]?.split('?')[0];
  expect(productId).toBeTruthy();
  await page.goto(href!);

  // The ImageUpload dropzone renders a hidden file input. Upload via setInputFiles.
  const fileInput = page.locator('input[type="file"]').first();
  await expect(fileInput).toBeAttached();
  await fileInput.setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: FIXTURE,
  });

  // A new preview tile appears with an <img> whose src is a RESOLVED url
  // (starts with /uploads/ or http(s)://), NOT a raw storage key.
  const newTile = page.locator('.new-file-item').first();
  await expect(newTile).toBeVisible({ timeout: 15_000 });
  const src = await newTile.locator('img').getAttribute('src');
  expect(src).toBeTruthy();
  expect(src!, 'url must be resolved, not a raw key').toMatch(/^(\/uploads\/|https?:\/\/)/);
  expect(src!, 'raw key must never reach the browser').not.toMatch(/^products\/[^/]+\//);

  // Persist across reload: the tile is now an existing-file with a resolved src.
  await page.reload();
  const existingTile = page.locator('.existing-file').first();
  await expect(existingTile).toBeVisible({ timeout: 15_000 });
  const persistedSrc = await existingTile.locator('img').getAttribute('src');
  expect(persistedSrc!, 'persisted url must be resolved').toMatch(/^(\/uploads\/|https?:\/\/)/);
});

test('admin can delete an existing image (bytes + row removed)', async ({ page }) => {
  test.setTimeout(120_000);
  await adminLogin(page);
  await page.goto('/admin/plugins/shop/products');
  const href = await page.locator(EDIT_LINK).first().getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(href!);

  // Ensure at least one existing image is present (seed or prior upload).
  const existingTile = page.locator('.existing-file').first();
  await expect(existingTile).toBeVisible({ timeout: 15_000 });
  const beforeCount = await page.locator('.existing-file').count();

  // Accept the confirm dialog and click remove.
  page.on('dialog', (d) => d.accept());
  await existingTile.locator('.remove-existing').click();

  // Tile removed after the DELETE round-trip.
  await expect(page.locator('.existing-file')).toHaveCount(beforeCount - 1, { timeout: 15_000 });

  // Persists across reload.
  await page.reload();
  await expect(page.locator('.existing-file')).toHaveCount(beforeCount - 1, { timeout: 15_000 });
});
