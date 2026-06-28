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
  'tests/lib/data/attribute-values.test.ts',
  'tests/lib/data/variants.test.ts',
  'tests/lib/data/price-inheritance.test.ts',
  'tests/lib/data/has-variants-derived.test.ts',
  'tests/lib/data/cart.test.ts',
  'tests/lib/data/orders.test.ts',
  'tests/lib/data/order-transitions.test.ts',
  'tests/lib/data/create-order-transactional.test.ts',
  'tests/lib/data/decrement-stock.test.ts',
  'tests/lib/data/restock.test.ts',
  'tests/lib/data/refund-accessor.test.ts',
  'tests/lib/data/order-number-unique.test.ts',
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
  'tests/api/handlers/public/checkout/orderId/pay.test.ts',
  'tests/api/handlers/public/checkout/index.test.ts',
  'tests/api/handlers/public/products/id.test.ts',
  'tests/api/handlers/public/products/index.test.ts',
  'tests/api/handlers/referral-codes/id.test.ts',
  'tests/api/handlers/referral-codes/index.test.ts',
  'tests/api/handlers/settings/general.test.ts',
  'tests/api/handlers/settings/payments/euplatesc.test.ts',
  'tests/api/handlers/settings/payments/stripe.test.ts',
  'tests/api/handlers/variants/variantId/attribute-values.test.ts',
  'tests/api/handlers/vouchers/id.test.ts',
  'tests/api/handlers/vouchers/index.test.ts',
  'tests/sql-join-audit.test.ts',
  'tests/db/seed-new-flow.test.ts',
  'tests/pages/custom-fields-visibility.test.ts',
  'tests/pages/admin-products-script-syntax.test.ts',
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
  'tests/db/seed-images.test.ts',
  'tests/full-suite-includes-r18.test.ts',
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
  // Guard against silent false greens: confirm the child actually registered
  // real tests. If this assertion ever fires, the child is skipping every file
  // (glob-bracket paths, env inheritance, or a loader regression).
  const testsLine = output.split('\n').find((l) => /^# tests /.test(l)) ||
    output.split('\n').find((l) => /^ℹ tests /.test(l)) || '';
  const m = testsLine.match(/(\d+)/);
  const testCount = m ? parseInt(m[1], 10) : 0;
  assert.ok(
    testCount >= 480,
    `child node --test registered only ${testCount} tests — expected >=700; possible silent skip. Output tail:\n${output.slice(-1500)}`,
  );
});
