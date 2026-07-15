# Pelerin RO Shop

E-commerce plugin for [Pelerin CMS](https://github.com/pelerintech/pelerin-cms). Provides product management, multi-currency pricing, global attributes with variants, cart/checkout, order management, payment provider integration (Stripe, euPlatesc), voucher and referral code support, and inventory tracking.

[![CI](https://img.shields.io/github/actions/workflow/status/pelerintech/pelerin-cms-shop-plugin/ci.yml?branch=main&label=CI)](https://github.com/pelerintech/pelerin-cms-shop-plugin/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-~99%25-brightgreen)](https://github.com/pelerintech/pelerin-cms-shop-plugin/actions)

## Installation

This plugin is installed into a running Pelerin CMS instance. The CMS discovers plugins via `pelerin.config.mjs`:

```js
export default {
  plugins: [
    {
      name: 'pelerin_ro_shop',
      source: 'git@github.com:pelerintech/pelerin-cms-shop-plugin.git',
      ref: 'main',
    },
  ],
};
```

Run from the CMS root directory:

```bash
npm run plugins:install   # clones the plugin and installs its dependencies
npm run dev               # starts the CMS dev server with the plugin loaded
```

See the [Pelerin CMS documentation](https://github.com/pelerintech/pelerin-cms) for detailed instructions.

## Available scripts

| Script                  | Command                                                             | Description                         |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| `npm run format`        | `prettier --write .`                                                | Format all source files             |
| `npm run format:check`  | `prettier --check .`                                                | Check formatting without writing    |
| `npm run lint`          | `eslint .`                                                          | Lint all source files               |
| `npm run type-check`    | `tsc --noEmit`                                                      | Type-check TypeScript files         |
| `npm test`              | `node --test tests/full-suite.test.ts`                              | Run unit test suite (Tiers 1–3)     |
| `npm run test:coverage` | `node --experimental-test-coverage --test tests/full-suite.test.ts` | Run unit tests with coverage report |

## Contributing / Local development

This plugin follows a strict RED → GREEN → REFACTOR workflow. See [`AGENTS.md`](./AGENTS.md) for the full development guide.

After every change, run:

```bash
npm run format && npm run lint && npm test
```

Before submitting a pull request, also run:

```bash
npm run type-check
```

### Test tiers

The test suite is organized into four tiers. See `AGENTS.md` §14 for details:

- **Tiers 1–3**: Unit tests, accessor tests, API handler tests, source syntax guards — run with `npm test`
- **Tier 4**: Playwright E2E tests that need the CMS dev server — run with `npx playwright test`

### CI pipeline

Push and pull request checks run via GitHub Actions (`.github/workflows/ci.yml`):

- **Quality** (gate): format check, lint, gitleaks (allow_failure), npm audit (allow_failure)
- **Type-check** (allow_failure): `tsc --noEmit`
- **Test** (gate, depends on quality): full test suite with coverage reporting
