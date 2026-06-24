import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright smoke suite for the pelerin_ro_shop plugin.
 *
 * Runs against the CMS dev server (../pelerin_cms), which loads this plugin via
 * a local symlink (see pelerin.config.mjs). The CMS dev server must be running
 * on http://localhost:3000 (its configured PORT / BETTER_AUTH_URL). Playwright
 * will reuse an already-running server; if none is running it starts one.
 *
 * Run:
 *   cd ../pelerin_cms && npm run dev   # start the CMS (port 3000)
 *   npx playwright test                # from the plugin root
 *
 * Or let Playwright start the server itself (see webServer below).
 *
 * The suite is intentionally small (~5 smoke tests) and covers the actual
 * user-action paths the r15 redesign fixed: login → product list → product
 * edit → "Varies by" assignment → Manage Variants matrix → variant edit modal
 * with price inputs. It is the only test tier that executes the client
 * `<script>` tags, so it catches browser-side breakage (e.g. the duplicate-
 * `const roleSelect` SyntaxError the 2026-06-24 re-evaluation found) that the
 * bare-Node suites cannot.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.SHOP_E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.SHOP_E2E_SKIP_START
    ? undefined
    : {
        command: 'npm run dev',
        cwd: '../pelerin_cms',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
