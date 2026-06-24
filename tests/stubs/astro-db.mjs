/**
 * Stub for the `astro:db` virtual module, used ONLY by the Node unit-test
 * loader so handler files are importable. The stub's exports are never
 * exercised in tests: refactored handlers' `runMethod` functions receive `db`
 * as an injected `HandlerDeps` parameter (from the harness or poison-db proxy),
 * and the thin `export const METHOD` wrapper — which uses the real `astro:db`
 * `db`/`sql`/table refs — is never called by unit tests.
 *
 * Each export is a recursive dummy Proxy so any accidental property access
 * returns a no-op rather than crashing on `undefined`.
 */
const dummy = new Proxy(function () {}, {
  get: () => dummy,
  apply: () => dummy,
  construct: () => dummy,
});

export const db = dummy;
export const sql = dummy;
export const dbSql = dummy;
export const eq = dummy;
export const and = dummy;
export const or = dummy;
export const inArray = dummy;
export const column = dummy;
export const defineDb = () => ({ tables: {} });
export const defineTable = (t) => t;
// Table objects (mirrors src/db/schema.ts names)
export const shop_settings = dummy;
export const categories = dummy;
export const products = dummy;
export const product_images = dummy;
export const product_variants = dummy;
export const product_attributes = dummy;
export const product_attribute_options = dummy;
export const product_attribute_assignments = dummy;
export const product_attribute_values = dummy;
export const product_prices = dummy;
export const translations = dummy;
export const carts = dummy;
export const cart_items = dummy;
export const orders = dummy;
export const order_items = dummy;
export const order_status_history = dummy;
export const vouchers = dummy;
export const referral_codes = dummy;
