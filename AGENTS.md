# AGENTS.md — pelerin_ro_shop

This document is the single source of truth for AI agents working on the `pelerin_ro_shop` plugin. Read it in full before modifying code.

---

## 1. What this project is

`pelerin_ro_shop` is a **Pelerin CMS plugin**. It does not run standalone. It is cloned into the CMS's `plugins/pelerin_ro_shop/` directory and loaded at build time by Pelerin's plugin system.

The CMS repo lives at `../pelerin_cms/`. The plugin repo is `../ecomm_plugin/` (this directory).

---

## 2. How Pelerin plugins work

The CMS discovers plugins via `pelerin.config.mjs` (gitignored, user-managed). Example entry for **git-based** install:

```js
export default {
  plugins: [
    {
      name: 'pelerin_ro_shop',
      source: 'git@github.com:your-org/pelerin_ro_shop.git',
      ref: 'main',
    },
  ],
};
```

Installation flow (run from CMS root):

```
npm run plugins:install   # clones/fetches + npm install inside plugins/<name>/
npm run dev               # Astro loads the plugin
```

The CMS integration reads `pelerin.manifest.json` at plugin root and wires up:
- **Database tables** via `astro:db:setup` hook (`extendDb` with `dbConfig` + optional `dbSeed`)
- **Routes** (public pages, admin pages, API endpoints) via `astro:config:setup` hook (`injectRoute`)
- **Admin navigation** items rendered in the CMS admin sidebar

---

## 3. Plugin manifest (`pelerin.manifest.json`)

Every plugin **must** have this file at its root. It is the contract the CMS reads.

```json
{
  "name": "pelerin_ro_shop",
  "version": "1.0.0",
  "dbConfig": "./src/db/config.ts",
  "dbSeed": "./src/db/seed.ts",
  "publicPages": [
    { "pattern": "/shop", "entrypoint": "./src/pages/shop/index.astro" }
  ],
  "adminPages": [
    { "pattern": "/admin/plugins/shop", "entrypoint": "./src/pages/admin/index.astro" }
  ],
  "apiEndpoints": [
    { "pattern": "/api/plugins/shop/orders", "entrypoint": "./src/api/orders.ts" }
  ],
  "navItems": [
    { "label": "Shop", "href": "/admin/plugins/shop", "icon": "shopping-cart" }
  ]
}
```

**Rules:**
- `name` must match the directory name and the `name` in `pelerin.config.mjs`
- `dbConfig` is required and points to an Astro DB `defineDb()` module
- `dbSeed` is optional; runs on every local dev startup (clears + re-seeds — see dummy pattern)
- All `entrypoint` paths are resolved relative to the plugin root
- Route `pattern` values are Astro route patterns (support `[param]` dynamic segments)

---

## 4. Database (`src/db/schema.ts`)

### schema.ts

Use **pure Drizzle** (`drizzle-orm`) to define tables. This is the **sole schema definition** — `src/db/config.ts` (astro:db) was deleted in r19. Tables are registered with the CMS via the plugin manifest's `dbConfig` pointing to the CMS's own DB setup.

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // ...
});
```

All accessor functions in `src/lib/data/` import table objects from `src/db/schema.ts`.

### seed.ts

Follow the **dummy plugin seed pattern**:
- Run on every local dev start
- **Always clear plugin tables first** (FK order — child tables before parents)
- Re-insert fixture data so the dev environment is predictable
- Handle missing CMS data gracefully (e.g., if a collection doesn't exist yet, log and return)
- Never run in production (the CMS seed guard handles this, but write defensively)

```ts
import { db, sql } from 'astro:db';

export default async function seed() {
  console.log('[Plugin:pelerin_ro_shop] Seeding...');
  await db.run(sql`DELETE FROM childTable`);
  await db.run(sql`DELETE FROM parentTable`);
  // ... insert fixtures
}
```

> **Note:** `seed.ts` still uses `astro:db` because it runs as an Astro hook. This is the **only** file allowed to import `astro:db`. All other code uses `sdk.db` (pages) or injected `db` (accessors).

---

## 5. Pages

### Public pages (`src/pages/...`)

Standard Astro pages. Route patterns are defined in the manifest. These become front-end routes on the CMS.

Use the CMS's Tailwind + DaisyUI setup. The dummy plugin loads styles via CDN for isolation, but Pelerin plugins can also rely on the host's CSS if consistent.

### Admin pages (`src/pages/admin/...`)

Back-office UI for managing the shop.

**Always use the admin layout:**

```astro
---
import AdminLayout from 'pelerin:admin-layout';
import { createPluginContext } from 'pelerin:plugin-sdk';

const sdk = createPluginContext();
const user = await sdk.auth.requireAdmin(Astro.request);
---

<AdminLayout title="Shop" currentPath="/admin/plugins/shop" user={user}>
  <!-- admin content -->
</AdminLayout>
```

The `currentPath` prop must match the `pattern` from the manifest so the sidebar highlights correctly.

---

## 6. API endpoints (`src/api/...`)

Standard Astro API routes (`export const POST: APIRoute = ...`).

**Always protect admin endpoints:**

```ts
import { createPluginContext } from 'pelerin:plugin-sdk';

const sdk = createPluginContext();
await sdk.auth.requireAdmin(request);
```

Return JSON with `{ success, data }` or `{ success: false, error }` shape for consistency with the dummy plugin.

---

## 6.5 Data access layer (`src/lib/data/`) — mandatory pattern

**All database access must live in `src/lib/data/` as pure functions that receive `db` as an injected parameter.** API endpoints, pages, and lib modules must NOT write queries inline — they call accessor functions and pass the `db` handle.

**How `db` is obtained at the call site:**
- **Admin pages**: `sdk.db` from `createPluginContext()` (see §5)
- **API endpoints**: injected `db` parameter via `runMethod({ db, sdk, ctx })` pattern (see §2)
- **Providers**: injected `db` parameter (see payment provider interface)

```ts
// src/lib/data/attributes.ts — the accessor
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, eq } from 'drizzle-orm';
import { product_attributes, translations } from '../../db/schema';

export async function listAttributes(db: LibSQLDatabase, locale: string) {
  return db.select().from(product_attributes).orderBy(product_attributes.sort_order);
}

// src/pages/admin/attributes/index.astro — the page
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listAttributes } from '../../../lib/data/attributes';

const sdk = createPluginContext();
const data = await listAttributes(sdk.db, 'ro');
```

**Rules:**
- Table objects are imported from `src/db/schema.ts` (pure Drizzle). This is the **sole schema definition** — no `astro:db` imports outside `seed.ts`.
- Use `inArray()` for IN clauses — NEVER `sql.raw()` with positional placeholders (produces `near "?": syntax error` in this Drizzle/libsql version).
- **No file** other than `seed.ts` may import from `astro:db`.
- Every new or changed data-access function must have tests in `tests/lib/data/` (see §14).

**Every new or changed data-access function must have tests** in `tests/lib/data/` against the real-SQLite test harness (`tests/db/harness.ts`) — at minimum a smoke test (query executes on populated and empty data, returns expected shape). Critical flows (attributes/variants, cart/checkout, orders) require deep row-level tests.

**Why:** the plugin is a full e-commerce solution; the data layer is the most critical surface. Isolated, injected, tested accessors catch runtime SQL bugs, survive the future `@astrojs/db` → Drizzle migration unchanged, and keep data logic in one auditable place. Established by the shop-r13-data-access-layer request.

---

## 7. Plugin SDK (`pelerin:plugin-sdk`)

This is the stable API surface for plugins. Do not import CMS internals directly — go through the SDK.

```ts
import { createPluginContext } from 'pelerin:plugin-sdk';

const sdk = createPluginContext();
```

### Available APIs

| Namespace | Methods | Purpose |
|-----------|---------|---------|
| `sdk.auth` | `getUser(req)`, `requireAdmin(req)`, `withAuth(req, handler)` | Authentication & authorization |
| `sdk.collections` | `listCollections()`, `listItems(coll, opts)`, `getItem(coll, id)`, `getItemById(id)`, `createItem(coll, data)`, `updateItem(coll, id, data)`, `deleteItem(coll, id)`, `findByName(coll, name)` | CMS collections CRUD |
| `sdk.db` | Drizzle `LibSQLDatabase` instance | Passed to accessor functions (never queried directly in pages) |
| `sdk.storage` | `upload(file)`, `delete(path)`, `getUrl(path)` | File upload (local or S3) |
| `sdk.webhooks` | `trigger(event, payload)` | Fire CMS webhooks |

### Source of truth

- SDK definition: `../pelerin_cms/src/lib/plugins/sdk/index.ts`
- Types: `../pelerin_cms/src/lib/plugins/types.ts`

---

## 8. Patterns from the dummy plugin (follow these)

The dummy plugin at `../pelerin_cms/dev-plugins/dummy/` is the reference implementation. Key patterns:

1. **Manifest first** — every route, page, and API must be declared in `pelerin.manifest.json`
2. **DB schema isolation** — plugin tables are defined in the plugin, not in the CMS core
3. **Seed guards** — check for CMS data existence before seeding; don't crash if collections are missing
4. **Accessors for all DB reads** — never write inline queries in pages or endpoints. Create a dedicated accessor in `src/lib/data/` for each distinct query pattern. Use `inArray()` for IN clauses, never `sql.raw()` with positional placeholders.
5. **Admin layout wrapping** — all admin pages use `pelerin:admin-layout` with `requireAdmin`
6. **Consistent JSON responses** — APIs return `{ success: boolean, ... }`
7. **Route namespacing** — prefix everything with `/admin/plugins/shop` and `/api/plugins/shop` to avoid collisions

---

## 9. Package dependencies

The plugin has its own `package.json` with **peer dependencies** on the host CMS packages:

```json
{
  "name": "pelerin_ro_shop",
  "version": "1.0.0",
  "private": true,
  "peerDependencies": {
    "astro": "^5.17.2",
    "@astrojs/db": "^0.19.0"
  }
}
```

Do **not** pin Astro or `@astrojs/db` as regular dependencies — the CMS provides them.

If the plugin needs additional runtime libraries (e.g., a payment SDK, a cart state library), add them as `dependencies`.

---

## 10. File structure (target)

```
pelerin_ro_shop/
├── pelerin.manifest.json       # Plugin contract (required)
├── package.json                # Peer deps + plugin deps
├── src/
│   ├── db/
│   │   ├── schema.ts           # Pure Drizzle table definitions (sole schema)
│   │   └── seed.ts             # Dev fixture data (only file allowed to import astro:db)
│   ├── lib/
│   │   └── data/               # All database accessors (tested in tests/lib/data/)
│   │       ├── attributes.ts
│   │       ├── attribute-options.ts
│   │       ├── attribute-assignments.ts
│   │       ├── cart.ts
│   │       ├── orders.ts
│   │       ├── products.ts
│   │       ├── referrals.ts
│   │       ├── settings.ts
│   │       └── vouchers.ts
│   ├── pages/
│   │   ├── shop/
│   │   │   └── index.astro     # Public shop page(s)
│   │   └── admin/
│   │       ├── index.astro     # Admin dashboard
│   │       └── [...].astro     # Other admin pages
│   └── api/
│       └── shop/
│           └── orders.ts       # API endpoints
└── AGENTS.md                   # This file
```

---

## 11. Resolved architectural decisions

All major architectural decisions have been resolved. See `reespec/decisions.md` for the full log. Key decisions:

- **Schema**: `src/db/schema.ts` (pure Drizzle) is the sole schema definition. `src/db/config.ts` (astro:db) was deleted in r19.
- **Data access**: All DB queries go through accessors in `src/lib/data/`. No inline queries in pages or endpoints.
- **Cart state**: Server-side via `carts` table, linked by session or user ID.
- **Payments**: Stripe + ePaylesc providers, pluggable via `src/providers/payment/` interface.
- **Orders**: Full status machine (`order-transitions.ts`), transactional creation, refund support.
- **Inventory**: Stock count on products and variants, decremented on order creation, restocked on refund.

---

## 12. CMS references (read before implementing)

| What | Where |
|------|-------|
| Plugin manifest validation | `../pelerin_cms/src/lib/plugins/manifest.ts` |
| Plugin types | `../pelerin_cms/src/lib/plugins/types.ts` |
| Plugin discovery (config parsing) | `../pelerin_cms/src/lib/plugins/discovery.ts` |
| SDK (all methods) | `../pelerin_cms/src/lib/plugins/sdk/index.ts` |
| Integration (how plugins are wired) | `../pelerin_cms/src/integrations/pelerin-plugins.ts` |
| Install script | `../pelerin_cms/scripts/install-plugins.ts` |
| Dummy plugin (reference) | `../pelerin_cms/dev-plugins/dummy/` |
| CMS DB config | `../pelerin_cms/db/config.ts` |
| CMS collections API | `../pelerin_cms/src/lib/plugins/sdk/collections.ts` |

---

## 13. Development workflow

When implementing a feature:

1. **Design** the DB tables, routes, and APIs in the request's plan
2. **Update** `pelerin.manifest.json` if new routes or endpoints are added
3. **Implement** in `src/db/schema.ts` (new tables), `src/lib/data/` (new accessors + tests), `src/pages/`, `src/api/`
4. **Test** by running the CMS with the plugin installed (`npm run plugins:install && npm run dev` from CMS root)
5. **Seed** data for predictable local dev (update `src/db/seed.ts`)

Never commit `node_modules/` or `package-lock.json` from the plugin directory — the CMS runs `npm install` inside the plugin folder on install.

---

## 14. Testing — tiers, how to run, and CI separation

The plugin has **four test tiers**, organized by what they exercise and what environment they need. They are deliberately **decoupled** so the fast, serverless tiers can run in any CI environment (including GitHub Actions) without booting the CMS, while the one tier that needs the CMS dev server runs separately.

### Tier overview

| Tier | Location | Runner | Needs CMS dev server? | What it catches |
|------|----------|--------|-----------------------|-----------------|
| 1. Data accessors | `tests/lib/data/*.test.ts` | `node --test` | No (real-SQLite harness) | SQL bugs, wrong rows, drift vs schema |
| 2. API handlers | `tests/api/handlers/**/*.test.ts` | `node --test` | No (`{db, sdk, ctx}` injection) | handler logic, auth/validation/error-wrap |
| 3. Client logic + page source | `tests/lib/*.test.ts`, `tests/pages/*.test.ts`, `tests/db/*.test.ts`, `tests/schemas/*.test.ts`, `tests/api/*.test.ts` | `node --test` | No | pure TS logic, schema parity, static UI structure, client-`<script>` syntax |
| 4. E2E (browser) | `tests/e2e/*.spec.ts` | `npx playwright test` | **Yes** (`../pelerin_cms` on `:3000`) | runtime client `<script>` behavior, full user flows |

Tiers 1–3 are aggregated by **`tests/full-suite.test.ts`** (see below). Tier 4 is **never** included in `full-suite` and **never** runs under `node --test` — it is the only tier that boots a browser and the CMS.

### Tier 1 — Data accessors (`tests/lib/data/`)

Every database accessor in `src/lib/data/` is tested against a real in-memory SQLite database provisioned by `tests/db/harness.ts`. The harness creates all tables from `src/db/schema.ts` and seeds predictable fixtures. Accessors receive `db: LibSQLDatabase` as an injected parameter (per §6.5), so tests pass the harness `db` directly — no `astro:db` import, no Astro build, no server.

```bash
node --test tests/lib/data/variants.test.ts        # one file
```

**Rule (§6.5):** every new or changed data-access function must have a test here — at minimum a smoke test (executes on populated AND empty data, returns expected shape); critical flows (attributes/variants, cart/checkout, orders) require deep row-level tests.

### Tier 2 — API handlers (`tests/api/handlers/`)

API handlers (`src/api/shop/**`) are split into a thin `export const METHOD: APIRoute` wrapper (imports `pelerin:plugin-sdk`, not unit-tested) and an injected `runMethod({ db, sdk, ctx })` core that is unit-tested. Tests inject the harness `db`, a fake `sdk` (whose `auth.requireAdmin` can throw on demand), and a fake `ctx`. A static loader (`tests/stubs/loader.mjs`) makes the handler files importable under bare Node by resolving `pelerin:` specifiers to inert stubs — these stubs are **never exercised**; all behavior comes from injection.

```bash
node --test tests/api/handlers/products/id/variants/variantId.test.ts
```

### Tier 3 — Client logic, schemas, page source (`tests/lib/`, `tests/pages/`, `tests/db/`, `tests/schemas/`, `tests/api/`)

- **Pure client logic** (e.g. `tests/lib/variant-matrix.test.ts`) — the Cartesian-product / SKU-generation / exists-diff logic extracted from inline `<script>` into `src/lib/variant-matrix.ts`, tested as plain TS under `node --test`. No DOM, no browser.
- **Client `<script>` syntax guard** (`tests/pages/admin-products-script-syntax.test.ts`) — extracts the client `<script>` from an admin `.astro` page and transforms it with **esbuild** (a transitive Vite/Astro dep at `node_modules/esbuild`) to catch parse-time errors (duplicate `const`, unbalanced braces) that `readFileSync + assert.match` page tests cannot detect. **When you add or edit a client `<script>` in any admin `.astro` page, add an analogous esbuild-syntax guard** rather than relying on source-string regex.
- **Schema integrity** (`tests/db/`) — `src/db/schema.ts` (pure Drizzle) is the sole schema definition; `tests/db/schema-integrity.test.ts` verifies all tables are creatable and columns match expectations. Seed files can't be imported under bare Node (`astro:db`), so seed tests assert on the source text.
- **Static UI structure** (`tests/pages/*.test.ts`) — honest checks of imports, element ids, CSS classes, breadcrumbs. These are NOT behavioral tests; runtime UI behavior is covered by Tier 4 (Playwright). Never treat a passing `readFileSync + assert.match` test as proof a page *works* — it only proves the source contains a string.

```bash
node --test tests/lib/variant-matrix.test.ts
node --test tests/pages/admin-products-script-syntax.test.ts
```

### The `tests/full-suite.test.ts` wrapper (Tiers 1–3)

A single test that spawns `node --test <all TIER 1–3 files>` as a child process and asserts success plus `testCount >= 500` (guards against silent false greens — if a regression makes the child skip every file, the count assertion fails loudly). When you add a new Tier 1–3 test file, **add its path to the `TEST_FILES` array** or it won't be part of the canonical suite.

```bash
node --test tests/full-suite.test.ts        # all unit/accessor/handler/syntax tests
```

**Two landmines preserved by this wrapper (see `decisions.md`):**
1. **Bare param names in test paths** — dynamic-route test files live at `tests/api/handlers/products/id.test.ts`, NOT `[id].test.ts`. `node --test` treats `[`/`]` as a glob character class and **silently skips** such files (0 tests, no failure). `tests/api/no-bracket-paths.test.ts` enforces this. Source files legitimately keep `[id]` for Astro routing; test paths mirror the source **minus brackets**.
2. **Nested `node --test` env** — the wrapper strips `NODE_TEST_CONTEXT` / `NODE_TEST_WORKER_ID` from the child env. If inherited, the child runs as a nested worker (0 tests, exit 0 → false green). Any `node --test` process that spawns another `node --test` MUST strip these vars.

### Tier 4 — Playwright E2E (`tests/e2e/`) — INDEPENDENT, needs the CMS

`tests/e2e/*.spec.ts` drives a real Chromium browser against the **running CMS dev server**. It is the **only tier that executes client `<script>` tags**, so it is the only tier that catches browser-side breakage (e.g. a duplicate-`const` SyntaxError that disables the whole client script — the exact bug the r15 re-evaluation found that all Tier 1–3 tests missed).

**Configuration:** `playwright.config.ts` at the plugin root. `webServer.command = 'npm run dev'`, `cwd: '../pelerin_cms'`, `url: 'http://localhost:3000'`, `reuseExistingServer: true`. Port **3000 is mandatory** — the CMS `.env` sets `PORT=3000` and `BETTER_AUTH_URL=http://localhost:3000`; better-auth's cookie/redirect flow is bound to that URL, so running on any other port breaks login.

**Setup (first run only):**
```bash
npx playwright install chromium
```

**Run:**
```bash
# Option A — let Playwright start the CMS dev server itself:
npx playwright test

# Option B — reuse an already-running CMS dev server (faster iteration):
cd ../pelerin_cms && npm run dev &
SHOP_E2E_SKIP_START=1 npx playwright test
```

**Credentials:** the suite logs in via the CMS auth form using the seeded admin (`admin@pelerin.local` / `123456789`, from `../pelerin_cms/db/seed.ts`). Override with `SHOP_E2E_ADMIN_EMAIL` / `SHOP_E2E_ADMIN_PASSWORD`; override the base URL with `SHOP_E2E_BASE_URL`.

**Why it is decoupled (and must stay decoupled):** Tier 4 depends on the CMS dev server, the seeded database, and a browser binary — none of which Tiers 1–3 need. Coupling them would mean every CI run that wants the fast unit feedback (Tiers 1–3, ~5s, no server) would also have to boot the full CMS stack (slow, flaky, environment-dependent). **For GitHub Actions (or any CI), run them as two separate jobs/steps:**

- **Unit job** (Tiers 1–3): `node --test tests/full-suite.test.ts` — no server, no browser, runs anywhere Node runs. This should be the gate on every push/PR.
- **E2E job** (Tier 4): `npx playwright install chromium && npx playwright test` — requires the CMS repo checked out at `../pelerin_cms` with dependencies installed and a seeded DB. Run on merges to `main` or nightly, not necessarily on every PR. Because `webServer.reuseExistingServer: true`, the job can either let Playwright start the server or start it in a prior step.

`tests/e2e/` is deliberately **not** listed in `tests/full-suite.test.ts`'s `TEST_FILES`, and `package.json` defines no `npm test` script that would entangle them — keep it that way. If you add an `npm test` convenience script in the future, make it run Tier 1–3 only (`node --test tests/full-suite.test.ts`); keep Playwright behind its own script (e.g. `npm run test:e2e` → `playwright test`).

### When to reach for which tier

- **New/changed accessor** → Tier 1 (mandatory per §6.5).
- **New/changed API handler** → Tier 2; add the file to `full-suite` `TEST_FILES`.
- **New/changed client `<script>` logic** → extract pure logic to `src/lib/` + Tier 3 unit test; **and** add an esbuild syntax guard; **and** add a Tier 4 E2E test for the user-visible flow (the only thing that proves the script actually runs in the browser).
- **New admin page / UI behavior** → Tier 4 is the source of truth for behavior; Tier 3 source-assertions only cover static structure.
- **CI gate** → Tier 1–3 (`full-suite`); Tier 4 in a separate, slower job.
