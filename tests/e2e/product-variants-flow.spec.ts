import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke suite for the product → variants flow (r15 redesign).
 *
 * Admin credentials come from the CMS seed (../pelerin_cms/db/seed.ts):
 *   admin@pelerin.local / 123456789
 *
 * These tests drive the real CMS dev server and execute the client `<script>`
 * in src/pages/admin/products/[id].astro — the only tier that catches
 * browser-side breakage (e.g. the duplicate-`const roleSelect` SyntaxError
 * found on 2026-06-24). They are intentionally few and high-level.
 *
 * Run (from plugin root):
 *   npx playwright test
 * (Playwright starts/reuses the CMS dev server on :3000 — see playwright.config.ts)
 */

const ADMIN_EMAIL = process.env.SHOP_E2E_ADMIN_EMAIL ?? 'admin@pelerin.local';
const ADMIN_PASSWORD = process.env.SHOP_E2E_ADMIN_PASSWORD ?? '123456789';

/** Log in via the CMS auth form and land on the admin dashboard. */
async function adminLogin(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // better-auth redirects admins to /admin/dashboard on success.
  await page.waitForURL('**/admin/**', { timeout: 20_000 });
}

/** A real product edit-page link from the products list (excludes /new). */
const EDIT_LINK = 'a[href*="/admin/plugins/shop/products/"][href*="?from_page="]';

test('admin can log in and reach the shop products list', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/admin/plugins/shop/products');
  await expect(page.locator(EDIT_LINK).first()).toBeVisible();
});

test('product edit page shows the redesigned vocabulary and no has_variants checkbox', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/admin/plugins/shop/products');
  const href = await page.locator(EDIT_LINK).first().getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(href!);

  // Redesigned vocabulary (r15 Task 18). The role select options are JS-free
  // server HTML, so they are present immediately.
  await expect(page.locator('#assign-role-select option[value="dimension"]')).toHaveText(/Varies by/i);
  await expect(page.locator('#assign-role-select option[value="field"]')).toHaveText(/Product info/i);
  // has_variants checkbox removed (r15 Task 17).
  await expect(page.locator('input[name="has_variants"]')).toHaveCount(0);
});

test('Manage Variants matrix renders on a product with dimension attributes', async ({ page }) => {
  await adminLogin(page);
  // The seeded "telefon-smart-x" product has Culoare + Stocare as dimensions
  // with existing variants — the matrix must mark them "✓ exists".
  const res = await page.request.get('/api/plugins/shop/products');
  const body = await res.json();
  const items = body.data?.items ?? body.data ?? [];
  const product = items.find((p: any) => p.has_variants === true) ?? items[0];
  test.skip(!product, 'no product with variants available');

  await page.goto(`/admin/plugins/shop/products/${product.id}`);

  // The "Manage Variants" button is rendered by client JS once dimensions load.
  const manageBtn = page.locator('#generate-variants-btn');
  await expect(manageBtn).toBeVisible({ timeout: 15_000 });
  await manageBtn.click();

  // The matrix modal opens and shows at least one "✓ exists" row (the seeded
  // variants) — proving the client script executed past the matrix render.
  const modal = page.locator('dialog[open]').first();
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await expect(modal.getByText(/exists/).first()).toBeVisible();
  await expect(modal.getByRole('button', { name: /Create Selected/i })).toBeVisible();
});

test('variant edit modal opens with per-currency price inputs', async ({ page }) => {
  await adminLogin(page);
  const res = await page.request.get('/api/plugins/shop/products');
  const body = await res.json();
  const items = body.data?.items ?? body.data ?? [];
  const product = items.find((p: any) => p.has_variants === true) ?? items[0];
  test.skip(!product, 'no product with variants available');

  await page.goto(`/admin/plugins/shop/products/${product.id}`);

  // The variant Edit buttons are rendered by client JS into #variants-section.
  const editBtn = page.locator('#variants-section [data-edit-variant]').first();
  await expect(editBtn).toBeVisible({ timeout: 15_000 });
  await editBtn.click();

  // The variant edit modal must include per-currency price inputs
  // (data-variant-price) — the r15 price-inheritance UI (Bug 5).
  const modal = page.locator('dialog[open]').first();
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await expect(modal.locator('[data-variant-price]').first()).toBeVisible({ timeout: 10_000 });
});

test('assigning a "Varies by" attribute to a fresh product enables Manage Variants', async ({ page }) => {
  await adminLogin(page);

  // Create a throwaway product so the assignment flow is deterministic.
  await page.goto('/admin/plugins/shop/products/new');
  const slug = `e2e-${Date.now()}`;
  await page.locator('#name').fill(`E2E ${slug}`);
  await page.locator('#slug').fill(slug);
  await page.locator('#type').selectOption('physical');
  await page.getByRole('button', { name: 'Create Product' }).click();
  // On success the page redirects to the edit URL; the "Edit:" heading is the
  // proof the create succeeded (a validation error stays on /new with no such
  // heading).
  await expect(page.getByRole('heading', { name: /Edit:/i })).toBeVisible({ timeout: 20_000 });

  await expect(page.getByText(/Variants & Attributes/i)).toBeVisible();

  // Pick the first available attribute (the seed ships "Culoare", a select
  // with options) and assign it as "Varies by".
  const assignSelect = page.locator('#assign-attribute-select');
  await expect(assignSelect).toBeVisible();
  const optionCount = await assignSelect.locator('option').count();
  test.skip(optionCount <= 1, 'no unassigned attributes available to assign');

  await assignSelect.selectOption({ index: 1 });
  await page.locator('#assign-role-select').selectOption('dimension');
  await page.locator('#assign-attribute-btn').click();

  // After the assignment POST succeeds, loadVariants() re-runs and the
  // "Manage Variants" button appears (dimensions.length > 0).
  await expect(page.locator('#generate-variants-btn')).toBeVisible({ timeout: 15_000 });
});
