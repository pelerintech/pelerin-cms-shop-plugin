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

## 4. Database (`src/db/config.ts` & `src/db/seed.ts`)

### config.ts

Use Astro DB (`astro:db`) to define tables. These tables are **merged** into the CMS database at build time.

```ts
import { defineDb, defineTable, column } from 'astro:db';

const products = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    name: column.text(),
    // ...
  },
});

export { products };

export default defineDb({
  tables: { products },
});
```

### seed.ts

Follow the **dummy plugin seed pattern**:
- Run on every local dev start (`astro:db seedEntrypoint`)
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
| `sdk.db` | Raw `db` export from `astro:db` | Direct DB access when needed |
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
4. **Raw SQL for cross-table reads** — when joining against CMS `collectionItems`, use `db.run(sql'...')` (see dummy's `enquire.astro`)
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
│   │   ├── config.ts           # Astro DB table definitions
│   │   └── seed.ts             # Dev fixture data
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

## 11. Open architectural decisions (TBD)

These will be resolved in upcoming requests. Do not guess — wait for the plan.

- **Products & categories**: CMS collection items vs. dedicated Astro DB tables?
- **Cart state**: server-side session, client-side localStorage, or hybrid?
- **Checkout flow**: single-page or multi-step?
- **Payments**: which provider and how are webhooks handled?
- **Orders**: table schema, status machine, admin workflow?
- **Inventory**: simple stock count or with reservations/variants?

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
3. **Implement** in `src/db/config.ts`, `src/pages/`, `src/api/`
4. **Test** by running the CMS with the plugin installed (`npm run plugins:install && npm run dev` from CMS root)
5. **Seed** data for predictable local dev (update `src/db/seed.ts`)

Never commit `node_modules/` or `package-lock.json` from the plugin directory — the CMS runs `npm install` inside the plugin folder on install.
