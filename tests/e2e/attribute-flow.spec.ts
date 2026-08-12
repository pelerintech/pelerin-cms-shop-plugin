import { test, expect, type Page } from '@playwright/test';

/**
 * Attribute create/edit/option E2E flow (shop-r34).
 *
 * Regression test for the shop-r34 bug: `new.astro` and `[id].astro` previously
 * put TypeScript-only syntax inside `<script is:inline>` blocks, which Astro
 * emits verbatim — so the browser threw a parse-time `SyntaxError` that
 * silently disabled the whole client script and made "Create Attribute" (and
 * edit/add-option) do nothing. The fix converted both pages to bundled
 * `<script>` modules importing `src/lib/client/attribute-form.ts`.
 *
 * Tier 4 is the ONLY tier that executes the client `<script>` in a real
 * browser, so it is the only tier that can prove the submit handlers actually
 * attach and the flows complete end-to-end. An interaction succeeding (create
 * redirects, edit persists after reload, option appears/disappears) is itself
 * the proof the bundled script ran with no SyntaxError.
 *
 * Runs as a single test with ONE admin login (the suite shares a dev server and
 * better-auth rate-limits repeated logins, so fewer logins keep the suite
 * stable), covering: UI create → UI edit → add option → delete option.
 *
 * Each user action happens after a fresh full `page.goto` (not right after an
 * in-page `window.location.reload()`), because a bundled `<script type=module>`
 * re-attaches its listeners asynchronously after reload — clicking a submit
 * button too quickly can hit a native (handler-less) submission. A fresh
 * navigation reliably completes before the listeners attach.
 *
 * Run (from plugin root):  npx playwright test
 */

const ADMIN_EMAIL = process.env.SHOP_E2E_ADMIN_EMAIL ?? 'admin@pelerin.local';
const ADMIN_PASSWORD = process.env.SHOP_E2E_ADMIN_PASSWORD ?? '123456789';
const SHOP = '/admin/plugins/shop/settings/attributes';

/** Log in via the CMS auth form and land on the admin dashboard. */
async function adminLogin(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/admin/**', { timeout: 20_000 });
}

test('create, edit, add-option, and delete-option for a global attribute', async ({ page }) => {
  await adminLogin(page);

  const stamp = Date.now();
  const attrName = `E2E Color ${stamp}`;

  // ── Create (fixes "Create Attribute does nothing") ───────────────────────
  await page.goto(`${SHOP}/new`);
  await expect(page.locator('#attribute-form')).toBeVisible();

  // If the client script died at parse time, clicking "Create Attribute" would
  // do nothing (no submit handler attached) — so reaching the detail page is
  // the proof the bundled script executed with no SyntaxError (Scenario 6).
  await page.selectOption('#type', 'select');
  await page.locator('#name').fill(attrName);
  await page.locator('#sort_order').fill('3');
  await page.getByRole('button', { name: 'Create Attribute' }).click();

  // Redirect to the detail page on success and the name persisted.
  await page.waitForURL(new RegExp(`^.*${SHOP}/[0-9a-f-]+$`), { timeout: 20_000 });
  await expect(page.locator('#attribute-form')).toBeVisible();
  await expect(page.locator('#name')).toHaveValue(attrName);
  const id = page.url().split('/').pop()!;

  // ── Edit: save WITHOUT type, sort_order parsed, persists after reload ────
  await page.goto(`${SHOP}/${id}`); // fresh navigation → handlers attached
  const renamed = `${attrName} v2`;
  await page.locator('#name').fill(renamed);
  await page.locator('#sort_order').fill('4');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.waitForLoadState('load');
  await expect(page.locator('#name')).toHaveValue(renamed);
  await expect(page.locator('#sort_order')).toHaveValue('4');

  // ── Add option (select-type) ─────────────────────────────────────────────
  await page.goto(`${SHOP}/${id}`); // fresh navigation → add-option handler attached
  const optionForm = page.locator('#add-option-form');
  await expect(optionForm).toBeVisible();
  await optionForm.locator('input[name="value"]').fill(`e2e-val-${stamp}`);
  await optionForm.locator('input[name="label"]').fill(`Ro label ${stamp}`);
  await optionForm.locator('input[name="sort_order"]').fill('9');
  await optionForm.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('#options-list')).toContainText(`e2e-val-${stamp}`, {
    timeout: 20_000,
  });

  // ── Delete option (existing flow, unchanged) ─────────────────────────────
  await page.goto(`${SHOP}/${id}`); // fresh navigation → delete listeners attached
  await expect(page.locator('#options-list')).toContainText(`e2e-val-${stamp}`);
  page.once('dialog', (d) => d.accept());
  await page.locator(`[data-option-id]:has-text("e2e-val-${stamp}") [data-delete-option]`).click();
  await page.waitForLoadState('load');
  await expect(page.locator('#options-list')).not.toContainText(`e2e-val-${stamp}`, {
    timeout: 20_000,
  });

  // ── Cleanup the throwaway attribute via the API ──────────────────────────
  const del = await page.request.delete(`/api/plugins/shop/attributes/${id}`);
  expect(del.ok()).toBeTruthy();
});
