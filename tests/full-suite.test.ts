import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';

// Every test file in the suite. Paths are passed as an argv array (not through
// a shell). Note: dynamic-route test files use bare param names (e.g.
// 'tests/api/handlers/products/id.test.ts') — NOT '[id]' — because
// `node --test` treats '[' / ']' as a glob character class and silently skips
// such files (0 tests registered). The guard in tests/api/no-bracket-paths.test.ts
// enforces this.
const TEST_FILES = [
  'tests/db/schema-exists.test.ts',
  'tests/db/schema-integrity.test.ts',
  'tests/db/harness.test.ts',
  'tests/db/harness-helpers.test.ts',
  'tests/db/harness-query-idioms.test.ts',
  'tests/db/harness-transaction.test.ts',
  'tests/lib/data/attributes.test.ts',
  'tests/lib/data/attribute-assignments.test.ts',
  'tests/lib/data/bank-transfer-provider.test.ts',
  'tests/lib/data/attribute-values.test.ts',
  'tests/lib/data/categories-search.test.ts',
  'tests/lib/data/variants.test.ts',
  'tests/lib/data/price-inheritance.test.ts',
  'tests/lib/data/has-variants-derived.test.ts',
  'tests/lib/data/cart.test.ts',
  'tests/lib/data/orders.test.ts',
  'tests/lib/data/order-transitions.test.ts',
  'tests/lib/data/order-transitions-offline.test.ts',
  'tests/lib/data/create-order-transactional.test.ts',
  'tests/lib/data/decrement-stock.test.ts',
  'tests/lib/data/restock.test.ts',
  'tests/lib/data/refund-accessor.test.ts',
  'tests/lib/data/order-number-unique.test.ts',
  'tests/lib/data/payment-providers-listing.test.ts',
  'tests/lib/data/public-products.test.ts',
  'tests/lib/data/ramburs-provider.test.ts',
  'tests/lib/data/unique-constraints.test.ts',
  'tests/lib/data/settings-typed.test.ts',
  'tests/lib/data/delete-product-cascade.test.ts',
  'tests/lib/data/delete-category-guard.test.ts',
  'tests/lib/data/list-sql.test.ts',
  'tests/lib/data/n-plus-1.test.ts',
  'tests/lib/data/catalog.test.ts',
  'tests/lib/data/vouchers-referrals-settings.test.ts',
  'tests/lib/order-number.test.ts',
  'tests/lib/stock-decrement.test.ts',
  'tests/lib/order-transitions.test.ts',
  'tests/lib/cart-clear.test.ts',
  'tests/lib/variant-matrix.test.ts',
  'tests/lib/csv-parser.test.ts',
  'tests/lib/import-products.test.ts',
  'tests/lib/import-prices.test.ts',
  'tests/schemas/import-schemas.test.ts',
  'tests/cart/session.test.ts',
  'tests/api/helpers.test.ts',
  'tests/api/no-bracket-paths.test.ts',
  'tests/api/import-products.test.ts',
  'tests/api/import-prices.test.ts',
  'tests/api/handlers/attributes/id.test.ts',
  'tests/api/handlers/attributes/id/options/optionId.test.ts',
  'tests/api/handlers/attributes/id/options/index.test.ts',
  'tests/api/handlers/attributes/index.test.ts',
  'tests/api/handlers/carts/id.test.ts',
  'tests/api/handlers/carts/index.test.ts',
  'tests/api/handlers/categories/id.test.ts',
  'tests/api/handlers/categories/index.test.ts',
  'tests/api/handlers/orders/id.test.ts',
  'tests/api/handlers/orders/id/cancel.test.ts',
  'tests/api/handlers/orders/id/refund.test.ts',
  'tests/api/handlers/orders/id/resend.test.ts',
  'tests/api/handlers/orders/id/status.test.ts',
  'tests/api/handlers/orders/export.test.ts',
  'tests/api/orders-export.test.ts',
  'tests/api/handlers/orders/index.test.ts',
  'tests/api/handlers/products/id.test.ts',
  'tests/api/handlers/products/id/attribute-values.test.ts',
  'tests/api/handlers/products/id/attributes/assignmentId.test.ts',
  'tests/api/handlers/products/id/attributes/index.test.ts',
  'tests/api/handlers/products/id/images/imageId.test.ts',
  'tests/api/handlers/products/id/images/index.test.ts',
  'tests/api/handlers/products/id/images-post.test.ts',
  'tests/api/handlers/products/id/images/reorder.test.ts',
  'tests/api/handlers/products/id/prices.test.ts',
  'tests/api/handlers/products/id/prices-post.test.ts',
  'tests/api/handlers/products/id/translations/locale.test.ts',
  'tests/api/handlers/products/id/translations-locale.test.ts',
  'tests/api/handlers/products/id/translations/index.test.ts',
  'tests/api/handlers/products/id/variants/variantId.test.ts',
  'tests/api/handlers/products/id/variants/index.test.ts',
  'tests/api/handlers/products/index.test.ts',
  'tests/api/handlers/public/cart/clear.test.ts',
  'tests/api/handlers/public/cart/index.test.ts',
  'tests/api/handlers/public/cart/items/itemId.test.ts',
  'tests/api/handlers/public/cart/items/index.test.ts',
  'tests/api/handlers/public/cart/referral/index.test.ts',
  'tests/api/handlers/public/cart/voucher/index.test.ts',
  'tests/api/handlers/public/categories/index.test.ts',
  'tests/api/handlers/public/checkout/checkout-provider.test.ts',
  'tests/api/handlers/public/checkout/orderId/pay.test.ts',
  'tests/api/handlers/public/checkout/orderId/pay-offline.test.ts',
  'tests/api/handlers/public/checkout/index.test.ts',
  'tests/api/handlers/public/products/id.test.ts',
  'tests/api/handlers/public/products/index.test.ts',
  'tests/api/handlers/referral-codes/id.test.ts',
  'tests/api/handlers/referral-codes/index.test.ts',
  'tests/api/handlers/settings/general.test.ts',
  'tests/api/handlers/settings/payments/bank-transfer.test.ts',
  'tests/api/handlers/settings/payments/euplatesc.test.ts',
  'tests/api/handlers/settings/payments/stripe.test.ts',
  'tests/api/handlers/variants/variantId/attribute-values.test.ts',
  'tests/api/handlers/vouchers/id.test.ts',
  'tests/api/handlers/vouchers/index.test.ts',
  'tests/sql-join-audit.test.ts',
  'tests/db/seed-new-flow.test.ts',
  'tests/pages/custom-fields-visibility.test.ts',
  'tests/pages/admin-products-script-syntax.test.ts',
  'tests/pages/admin-searchselect-syntax.test.ts',
  'tests/pages/admin-import-ui.test.ts',
  'tests/pages/admin-import-script-syntax.test.ts',
  'tests/pages/admin-orders-partial-refund.test.ts',
  // ── r18: product image storage ──
  'tests/lib/storage-keys.test.ts',
  'tests/lib/data/product-images-resolve.test.ts',
  'tests/lib/data/product-images-create.test.ts',
  'tests/api/handlers/helpers-storage.test.ts',
  'tests/schemas/product-image-schema.test.ts',
  'tests/pages/admin-product-images-read.test.ts',
  'tests/pages/image-upload-script-syntax.test.ts',
  'tests/pages/rich-text-editor-script-syntax.test.ts',
  'tests/db/seed-images.test.ts',
  'tests/full-suite-includes-r18.test.ts',
  // ── r20: locales/currencies management ──
  'tests/lib/data/locales-currencies.test.ts',
  'tests/api/handlers/settings/locales.test.ts',
  'tests/api/handlers/settings/currencies.test.ts',
  'tests/lib/data/migrate-default-locale.test.ts',
  'tests/schemas/locale-currency-schema.test.ts',
  'tests/pages/admin-settings-script-syntax.test.ts',
  // ── r21: test suite repair (schema + seed tests under anti-false-green umbrella) ──
  'tests/schemas/enums.test.ts',
  'tests/schemas/fk-integrity.schema.test.ts',
  'tests/schemas/misc.schema.test.ts',
  'tests/schemas/order.schema.test.ts',
  'tests/schemas/product.schema.test.ts',
  'tests/schemas/voucher.schema.test.ts',
  'tests/db/seed-core.test.ts',
  'tests/db/seed-products.test.ts',
  'tests/db/seed-vouchers.test.ts',
  // ── r21: category multi-locale admin ──
  'tests/lib/data/category-translations.test.ts',
  'tests/pages/admin-categories-edit-ui.test.ts',
  'tests/pages/admin-categories-new-ui.test.ts',
  // ── r22: locale round-trip regression guards ──
  'tests/lib/data/locale-roundtrip.test.ts',
  // ── r23: locale slug routing ──
  'tests/lib/data/slug-resolution.test.ts',
  'tests/lib/data/slug-collision-guard.test.ts',
  'tests/lib/data/find-slug-collisions.test.ts',
  'tests/pages/admin-slug-collision-warning.test.ts',
  // ── r24: euPlatesc protocol fix ──
  'tests/lib/euplatesc-mac.test.ts',
  'tests/lib/euplatesc-mac-fieldsets.test.ts',
  'tests/providers/euplatesc-initiate-amount.test.ts',
  'tests/providers/euplatesc-initiate-signature.test.ts',
  'tests/providers/payment-options.test.ts',
  'tests/providers/euplatesc-initiate-extradata.test.ts',
  'tests/providers/euplatesc-initiate-params.test.ts',
  'tests/providers/euplatesc-initiate-provider.test.ts',
  'tests/providers/euplatesc-webhook-action.test.ts',
  'tests/providers/euplatesc-webhook-mac.test.ts',
  'tests/providers/euplatesc-webhook-test-prefix.test.ts',
  'tests/api/handlers/webhooks/euplatesc.test.ts',
  'tests/providers/interface.test.ts',
  'tests/providers/euplatesc-isconfigured.test.ts',
  'tests/providers/stripe-isconfigured.test.ts',
  'tests/providers/stripe-refund-stub.test.ts',
  'tests/providers/euplatesc-refund-request.test.ts',
  'tests/api/handlers/orders/id/refund-euplatesc.test.ts',
  'tests/providers/stripe-amount.test.ts',
  'tests/api/handlers/payment-providers.test.ts',
  'tests/api/handlers/payment-providers-listing.test.ts',
  'tests/api/handlers/public/checkout/providers.test.ts',
  'tests/lib/data/order-transitions-awaiting-pending.test.ts',
  'tests/schemas/euplatesc-settings-schema.test.ts',
  'tests/api/handlers/settings/payments/euplatesc-4fields.test.ts',
  'tests/pages/admin-euplatesc-settings-ui.test.ts',
  'tests/pages/admin-euplatesc-settings-script-syntax.test.ts',
  'tests/api/handlers/settings/payments/ramburs.test.ts',
  'tests/api/handlers/settings/payments/euplatesc/test-connection.test.ts',
  'tests/api/handlers/settings/payments/euplatesc/test-payment.test.ts',
  'tests/api/handlers/settings/payments/euplatesc/test-result.test.ts',
  'tests/api/handlers/orders/id/create-payment.test.ts',
  'tests/api/handlers/public/checkout/orderId/pay-urls.test.ts',
  'tests/pages/admin-order-detail-ui.test.ts',
  'tests/pages/admin-order-detail-script-syntax.test.ts',
  // ── r27-manifest: bank-transfer route registration ──
  'tests/manifest/bank-transfer-route.test.ts',
];

test('full test suite passes (node --test <all test files>)', () => {
  // Runs every test file: db schema/parity/harness, r13 data accessors, r14
  // prerequisite lib-module tests, r14 API handler unit tests (the real
  // injection-based tests in tests/api/handlers/), and the helpers smoke test.
  // The old regex-over-source API tests were removed (r14 Task 29).
  //
  // CRITICAL: strip NODE_TEST_CONTEXT / NODE_TEST_WORKER_ID from the child env.
  // `node --test` sets these on its own process; if the child `node --test`
  // inherits them it runs as a nested test worker — producing NO reporter
  // output and registering 0 tests while still exiting 0. That made this suite
  // a silent false green for every file (not just the bracket files flagged in
  // the 2026-06-23 evaluation). A clean env forces the child to run as a real
  // top-level test runner.
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.NODE_TEST_WORKER_ID;
  let output = '';
  try {
    output = execFileSync('node', ['--test', ...TEST_FILES], {
      encoding: 'utf-8',
      timeout: 180000,
      stdio: 'pipe',
      env: childEnv,
    });
  } catch (err: any) {
    output = err.stdout || err.stderr || '';
    assert.fail(`Test suite failed:\n${output.slice(-2500)}`);
  }
});
