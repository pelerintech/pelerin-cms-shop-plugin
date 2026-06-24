/**
 * Real-SQLite test harness for the pelerin_ro_shop data accessors.
 *
 * Spins up an in-memory libSQL database, creates all plugin tables from
 * `src/db/schema.ts` (the pure-Drizzle schema that mirrors `src/db/config.ts`),
 * and returns a `LibSQLDatabase` instance that data accessors can query.
 *
 * The `db` returned here is the same Drizzle `LibSQLDatabase` type that
 * `astro:db` provides in prod, so accessors behave identically in tests and prod.
 */
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../../src/db/schema.ts';

const COLUMNS_SYMBOL = Symbol.for('drizzle:Columns');

/** All plugin table objects from the schema module. */
const tables = Object.entries(schema).filter(
  ([, v]) => v && typeof v === 'object' && Object.getOwnPropertySymbols(v).some(s => s === COLUMNS_SYMBOL)
) as [string, Record<string, any>][];

/**
 * Generate a CREATE TABLE statement from a Drizzle sqliteTable object by
 * introspecting its columns (name, SQL type, notNull, primary).
 */
function createTableSQL(tableName: string, table: Record<string, any>): string {
  const cols = table[COLUMNS_SYMBOL] as Record<string, any>;
  const colDefs = Object.values(cols).map((col: any) => {
    const type = col.getSQLType().toUpperCase();
    let def = `"${col.name}" ${type}`;
    if (col.primary) def += ' PRIMARY KEY';
    if (col.notNull) def += ' NOT NULL';
    return def;
  });
  return `CREATE TABLE "${tableName}" (\n  ${colDefs.join(',\n  ')}\n)`;
}

export interface TestDb {
  db: LibSQLDatabase<typeof schema>;
  cleanup: () => Promise<void>;
}

/**
 * Create a fresh in-memory database with all plugin tables.
 * Each call is isolated — no shared state across tests.
 */
export async function createTestDb(): Promise<TestDb> {
  const db = drizzle(':memory:', { schema });

  // Create all tables. Drop order doesn't matter for CREATE; order only
  // matters for reset/seed clears (handled by resetDb).
  for (const [name, table] of tables) {
    await db.run(sql.raw(createTableSQL(name, table)));
  }

  const cleanup = async () => {
    // libSQL in-memory client is GC'd; nothing to close explicitly.
    // Kept async for future file-based harness compatibility.
  };

  return { db, cleanup };
}

import {
  shop_settings, categories, products, product_images, product_variants,
  product_attributes, product_attribute_options, product_attribute_assignments,
  product_attribute_values, product_prices, translations, carts, cart_items,
  orders, order_items, order_status_history, vouchers, referral_codes,
} from '../../src/db/schema.ts';

/** Tables in FK-safe clear order (children before parents), mirroring seed.ts. */
const CLEAR_ORDER = [
  product_attribute_values, product_attribute_assignments, product_attribute_options,
  product_attributes, product_variants, product_prices, product_images, translations,
  products, categories, cart_items, carts, order_items, order_status_history, orders,
  vouchers, referral_codes, shop_settings,
];

/** Map of table name → table object, for insertFixture. */
const tableByName = Object.fromEntries(tables) as Record<string, Record<string, any>>;

export interface Fixtures {
  simpleProductId: string;
  variantProductId: string;
  attrColorId: string;
  attrStorageId: string;
  attrBrandId: string;
  attrWeightId: string;
  optColorBlackId: string;
  optColorWhiteId: string;
  optStorage128Id: string;
  optStorage256Id: string;
  assignVariantColorId: string;
  assignVariantStorageId: string;
  assignVariantBrandId: string;
  assignSimpleBrandId: string;
  assignSimpleWeightId: string;
  variantBlack128Id: string;
  variantWhite256Id: string;
  categoryBooksId: string;
  categoryPhonesId: string;
}

/** Clear all plugin tables in FK-safe order (children before parents). */
export async function resetDb(db: LibSQLDatabase<typeof schema>): Promise<void> {
  for (const table of CLEAR_ORDER) {
    await db.delete(table);
  }
}

/** Insert a single row into a named table. */
export async function insertFixture(
  db: LibSQLDatabase<typeof schema>,
  tableName: string,
  row: Record<string, any>
): Promise<void> {
  const table = tableByName[tableName];
  if (!table) throw new Error(`Unknown table: ${tableName}`);
  await db.insert(table).values(row);
}

function rid(): string {
  return crypto.randomUUID();
}

/**
 * Seed a predictable minimal dataset mirroring src/db/seed.ts (trimmed to the
 * entities accessors need: settings, categories, products, attributes, options,
 * assignments, values, variants, prices, vouchers, referrals).
 * Returns stable IDs so tests can reference specific entities.
 */
export async function seedMinimal(db: LibSQLDatabase<typeof schema>): Promise<Fixtures> {
  const now = new Date();

  const f: Fixtures = {
    simpleProductId: rid(),
    variantProductId: rid(),
    attrColorId: rid(),
    attrStorageId: rid(),
    attrBrandId: rid(),
    attrWeightId: rid(),
    optColorBlackId: rid(),
    optColorWhiteId: rid(),
    optStorage128Id: rid(),
    optStorage256Id: rid(),
    assignVariantColorId: rid(),
    assignVariantStorageId: rid(),
    assignVariantBrandId: rid(),
    assignSimpleBrandId: rid(),
    assignSimpleWeightId: rid(),
    variantBlack128Id: rid(),
    variantWhite256Id: rid(),
    categoryBooksId: rid(),
    categoryPhonesId: rid(),
  };

  // Settings
  await db.insert(shop_settings).values([
    { id: rid(), key: 'locales', value: JSON.stringify([{ code: 'ro', name: 'Română', isDefault: true }, { code: 'en', name: 'English', isDefault: false }]) },
    { id: rid(), key: 'currencies', value: JSON.stringify([{ code: 'RON', name: 'Leu românesc', isDefault: true }, { code: 'EUR', name: 'Euro', isDefault: false }]) },
    { id: rid(), key: 'order_number_prefix', value: 'ORD' },
    { id: rid(), key: 'order_number_year', value: String(now.getFullYear()) },
    { id: rid(), key: 'order_number_padding', value: '6' },
    { id: rid(), key: 'order_number_sequence', value: '0' },
  ]);

  // Categories
  await db.insert(categories).values([
    { id: f.categoryPhonesId, parent_id: null, name: 'Telefoane', description: 'Telefoane mobile', slug: 'telefoane', sort_order: 1, created_at: null, updated_at: null },
    { id: f.categoryBooksId, parent_id: null, name: 'Cărți', description: 'Cărți de specialitate', slug: 'carti', sort_order: 2, created_at: null, updated_at: null },
  ]);
  await db.insert(translations).values([
    { id: rid(), entity_type: 'category', entity_id: f.categoryPhonesId, locale: 'ro', name: 'Telefoane', description: 'Telefoane mobile', slug: 'telefoane', label: null },
    { id: rid(), entity_type: 'category', entity_id: f.categoryBooksId, locale: 'ro', name: 'Cărți', description: 'Cărți de specialitate', slug: 'carti', label: null },
    { id: rid(), entity_type: 'category', entity_id: f.categoryPhonesId, locale: 'en', name: 'Phones', description: 'Mobile phones', slug: 'phones', label: null },
    { id: rid(), entity_type: 'category', entity_id: f.categoryBooksId, locale: 'en', name: 'Books', description: 'Specialty books', slug: 'books', label: null },
  ]);

  // Global attributes
  await db.insert(product_attributes).values([
    { id: f.attrColorId, name: 'Culoare', type: 'select', sort_order: 1 },
    { id: f.attrStorageId, name: 'Stocare', type: 'select', sort_order: 2 },
    { id: f.attrBrandId, name: 'Brand', type: 'text', sort_order: 3 },
    { id: f.attrWeightId, name: 'Greutate', type: 'number', sort_order: 4 },
  ]);
  await db.insert(translations).values([
    { id: rid(), entity_type: 'product_attribute', entity_id: f.attrColorId, locale: 'en', name: 'Color', description: null, slug: null, label: null },
    { id: rid(), entity_type: 'product_attribute', entity_id: f.attrStorageId, locale: 'en', name: 'Storage', description: null, slug: null, label: null },
    { id: rid(), entity_type: 'product_attribute', entity_id: f.attrBrandId, locale: 'en', name: 'Brand', description: null, slug: null, label: null },
    { id: rid(), entity_type: 'product_attribute', entity_id: f.attrWeightId, locale: 'en', name: 'Weight', description: null, slug: null, label: null },
  ]);

  // Attribute options
  await db.insert(product_attribute_options).values([
    { id: f.optColorBlackId, attribute_id: f.attrColorId, value: 'black', sort_order: 1 },
    { id: f.optColorWhiteId, attribute_id: f.attrColorId, value: 'white', sort_order: 2 },
    { id: f.optStorage128Id, attribute_id: f.attrStorageId, value: '128GB', sort_order: 1 },
    { id: f.optStorage256Id, attribute_id: f.attrStorageId, value: '256GB', sort_order: 2 },
  ]);
  await db.insert(translations).values([
    { id: rid(), entity_type: 'product_attribute_option', entity_id: f.optColorBlackId, locale: 'ro', name: null, description: null, slug: null, label: 'Negru' },
    { id: rid(), entity_type: 'product_attribute_option', entity_id: f.optColorWhiteId, locale: 'ro', name: null, description: null, slug: null, label: 'Alb' },
    { id: rid(), entity_type: 'product_attribute_option', entity_id: f.optStorage128Id, locale: 'ro', name: null, description: null, slug: null, label: '128 GB' },
    { id: rid(), entity_type: 'product_attribute_option', entity_id: f.optStorage256Id, locale: 'ro', name: null, description: null, slug: null, label: '256 GB' },
    { id: rid(), entity_type: 'product_attribute_option', entity_id: f.optColorBlackId, locale: 'en', name: null, description: null, slug: null, label: 'Black' },
    { id: rid(), entity_type: 'product_attribute_option', entity_id: f.optColorWhiteId, locale: 'en', name: null, description: null, slug: null, label: 'White' },
    { id: rid(), entity_type: 'product_attribute_option', entity_id: f.optStorage128Id, locale: 'en', name: null, description: null, slug: null, label: '128 GB' },
    { id: rid(), entity_type: 'product_attribute_option', entity_id: f.optStorage256Id, locale: 'en', name: null, description: null, slug: null, label: '256 GB' },
  ]);

  // Products
  await db.insert(products).values([
    { id: f.simpleProductId, sku: 'BOOK-001', type: 'physical', has_variants: false, vat_rate: 0.05, stock: 100, category_id: f.categoryBooksId, active: true, name: 'Carte de programare', description: 'O carte excelentă', slug: 'carte-programare', created_at: now, updated_at: now },
    { id: f.variantProductId, sku: null, type: 'physical', has_variants: true, vat_rate: 0.19, stock: null, category_id: f.categoryPhonesId, active: true, name: 'Telefon Smart X', description: 'Telefon inteligent', slug: 'telefon-smart-x', created_at: now, updated_at: now },
  ]);
  await db.insert(translations).values([
    { id: rid(), entity_type: 'product', entity_id: f.simpleProductId, locale: 'ro', name: 'Carte de programare', description: 'O carte excelentă', slug: 'carte-programare', label: null },
    { id: rid(), entity_type: 'product', entity_id: f.variantProductId, locale: 'ro', name: 'Telefon Smart X', description: 'Telefon inteligent', slug: 'telefon-smart-x', label: null },
    { id: rid(), entity_type: 'product', entity_id: f.simpleProductId, locale: 'en', name: 'Programming Book', description: 'An excellent book', slug: 'programming-book', label: null },
    { id: rid(), entity_type: 'product', entity_id: f.variantProductId, locale: 'en', name: 'Smart Phone X', description: 'A smart phone', slug: 'smart-phone-x', label: null },
  ]);

  // Simple product prices
  await db.insert(product_prices).values([
    { id: rid(), product_id: f.simpleProductId, variant_id: null, currency: 'RON', price_net: 5000 },
    { id: rid(), product_id: f.simpleProductId, variant_id: null, currency: 'EUR', price_net: 1000 },
  ]);

  // Attribute assignments
  await db.insert(product_attribute_assignments).values([
    { id: f.assignSimpleBrandId, product_id: f.simpleProductId, attribute_id: f.attrBrandId, role: 'field', sort_order: 1, offered_option_ids: '[]' },
    { id: f.assignSimpleWeightId, product_id: f.simpleProductId, attribute_id: f.attrWeightId, role: 'field', sort_order: 2, offered_option_ids: '[]' },
    { id: f.assignVariantColorId, product_id: f.variantProductId, attribute_id: f.attrColorId, role: 'dimension', sort_order: 1, offered_option_ids: JSON.stringify([f.optColorBlackId, f.optColorWhiteId]) },
    { id: f.assignVariantStorageId, product_id: f.variantProductId, attribute_id: f.attrStorageId, role: 'dimension', sort_order: 2, offered_option_ids: JSON.stringify([f.optStorage128Id, f.optStorage256Id]) },
    { id: f.assignVariantBrandId, product_id: f.variantProductId, attribute_id: f.attrBrandId, role: 'field', sort_order: 3, offered_option_ids: '[]' },
  ]);

  // Product-level attribute values (field-role)
  await db.insert(product_attribute_values).values([
    { id: rid(), entity_type: 'product', entity_id: f.simpleProductId, assignment_id: f.assignSimpleBrandId, option_id: null, value_text: 'Pelerin Press', value_number: null, value_boolean: null },
    { id: rid(), entity_type: 'product', entity_id: f.simpleProductId, assignment_id: f.assignSimpleWeightId, option_id: null, value_text: null, value_number: 0.5, value_boolean: null },
    { id: rid(), entity_type: 'product', entity_id: f.variantProductId, assignment_id: f.assignVariantBrandId, option_id: null, value_text: 'SmartTech', value_number: null, value_boolean: null },
  ]);

  // Variants
  await db.insert(product_variants).values([
    { id: f.variantBlack128Id, product_id: f.variantProductId, sku: 'SMX-BLK-128', stock: 50, active: true },
    { id: f.variantWhite256Id, product_id: f.variantProductId, sku: 'SMX-WHT-256', stock: 30, active: true },
  ]);

  // Variant-level dimension values
  await db.insert(product_attribute_values).values([
    { id: rid(), entity_type: 'variant', entity_id: f.variantBlack128Id, assignment_id: f.assignVariantColorId, option_id: f.optColorBlackId, value_text: null, value_number: null, value_boolean: null },
    { id: rid(), entity_type: 'variant', entity_id: f.variantBlack128Id, assignment_id: f.assignVariantStorageId, option_id: f.optStorage128Id, value_text: null, value_number: null, value_boolean: null },
    { id: rid(), entity_type: 'variant', entity_id: f.variantWhite256Id, assignment_id: f.assignVariantColorId, option_id: f.optColorWhiteId, value_text: null, value_number: null, value_boolean: null },
    { id: rid(), entity_type: 'variant', entity_id: f.variantWhite256Id, assignment_id: f.assignVariantStorageId, option_id: f.optStorage256Id, value_text: null, value_number: null, value_boolean: null },
  ]);

  // Variant prices
  await db.insert(product_prices).values([
    { id: rid(), product_id: null, variant_id: f.variantBlack128Id, currency: 'RON', price_net: 25000 },
    { id: rid(), product_id: null, variant_id: f.variantBlack128Id, currency: 'EUR', price_net: 5000 },
    { id: rid(), product_id: null, variant_id: f.variantWhite256Id, currency: 'RON', price_net: 30000 },
    { id: rid(), product_id: null, variant_id: f.variantWhite256Id, currency: 'EUR', price_net: 6000 },
  ]);

  // Vouchers
  await db.insert(vouchers).values([
    { id: rid(), code: 'SAVE10', type: 'fixed_amount', value: 1000, min_order_value: 5000, max_uses: 100, uses_count: 0, valid_from: null, valid_until: null, single_use_per_customer: false, active: true, created_at: now, updated_at: now },
    { id: rid(), code: 'PCT20', type: 'percentage', value: 20, min_order_value: null, max_uses: null, uses_count: 0, valid_from: null, valid_until: null, single_use_per_customer: true, active: true, created_at: now, updated_at: now },
  ]);

  // Referral codes
  await db.insert(referral_codes).values([
    { id: rid(), code: 'PARTNER10', name: 'Partner A', discount_type: 'percentage', discount_value: 10, active: true, notes: null, created_at: now, updated_at: now },
  ]);

  return f;
}

export { schema };

// re-export schema tables for convenience in tests
export {
  shop_settings, categories, products, product_images, product_variants,
  product_attributes, product_attribute_options, product_attribute_assignments,
  product_attribute_values, product_prices, translations, carts, cart_items,
  orders, order_items, order_status_history, vouchers, referral_codes,
} from '../../src/db/schema.ts';
