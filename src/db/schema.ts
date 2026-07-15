/**
 * Pure Drizzle schema for the pelerin_ro_shop plugin.
 *
 * This module is the forward-looking schema definition. It mirrors `./config.ts`
 * (which uses astro:db's defineTable for the CMS build) column-for-column.
 * Data accessors in `src/lib/data/` import table objects FROM THIS FILE, not from
 * `astro:db`, so they are importable and executable in the real-SQLite test harness
 * outside the Astro build.
 *
 * A parity test (`tests/db/schema-parity.test.ts`) guards drift between this file
 * and `config.ts`. When the future @astrojs/db → pure-Drizzle CMS migration lands,
 * `config.ts` is deleted and this file becomes the sole schema definition.
 *
 * Type mapping (astro:db → drizzle-orm/sqlite-core):
 *   column.text()                    → text().notNull()
 *   column.text({ optional: true })  → text()
 *   column.number()                  → integer().notNull()
 *   column.number({ optional })      → integer()
 *   column.boolean()                 → integer({ mode: 'boolean' }).notNull()
 *   column.boolean({ optional })     → integer({ mode: 'boolean' })
 *   column.date(...)                 → dateType()[.notNull()]  (TEXT ISO, matches astro:db)
 */
import { sqliteTable, text, integer, customType, index } from 'drizzle-orm/sqlite-core';

/**
 * Date column type mirroring astro:db's date customType exactly:
 * stored as TEXT (ISO 8601 string), converted to/from Date via toISOString / new Date.
 * This must match astro:db's `dateType` (see @astrojs/db dist/runtime/index.js) so that
 * accessors using these table objects read/write the same representation in the prod
 * (astro:db-merged) database and in the test harness.
 */
const dateType = customType<{
  data: Date;
  driverData: string;
}>({
  dataType() {
    return 'text';
  },
  toDriver(value: Date) {
    return value.toISOString();
  },
  fromDriver(value: string): Date {
    if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(value)) {
      value += 'Z';
    }
    return new Date(value);
  },
});

export const shop_settings = sqliteTable('shop_settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
});

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    parent_id: text('parent_id'),
    name: text('name').notNull(),
    description: text('description'),
    slug: text('slug').notNull().unique(),
    sort_order: integer('sort_order').notNull(),
    created_at: dateType('created_at'),
    updated_at: dateType('updated_at'),
  },
  (table) => ({
    categories_parent_id_idx: index('categories_parent_id_idx').on(table.parent_id),
  })
);

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  sku: text('sku').unique(),
  type: text('type').notNull(),
  has_variants: integer('has_variants', { mode: 'boolean' }).notNull(),
  vat_rate: integer('vat_rate'),
  stock: integer('stock'),
  category_id: text('category_id'),
  active: integer('active', { mode: 'boolean' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  slug: text('slug').notNull().unique(),
  created_at: dateType('created_at').notNull(),
  updated_at: dateType('updated_at'),
});

export const product_images = sqliteTable(
  'product_images',
  {
    id: text('id').primaryKey(),
    product_id: text('product_id').notNull(),
    variant_id: text('variant_id'),
    url: text('url').notNull(), // holds a storage KEY (not a URL); resolved to URL at the accessor layer (design D2)
    alt: text('alt'),
    sort_order: integer('sort_order').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    original_filename: text('original_filename'),
  },
  (table) => ({
    product_images_product_id_idx: index('product_images_product_id_idx').on(table.product_id),
  })
);

export const product_variants = sqliteTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    product_id: text('product_id').notNull(),
    sku: text('sku'),
    stock: integer('stock'),
    active: integer('active', { mode: 'boolean' }).notNull(),
  },
  (table) => ({
    product_variants_product_id_idx: index('product_variants_product_id_idx').on(table.product_id),
  })
);

export const product_attributes = sqliteTable('product_attributes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  sort_order: integer('sort_order').notNull(),
});

export const product_attribute_options = sqliteTable('product_attribute_options', {
  id: text('id').primaryKey(),
  attribute_id: text('attribute_id').notNull(),
  value: text('value').notNull(),
  sort_order: integer('sort_order').notNull(),
});

export const product_attribute_assignments = sqliteTable(
  'product_attribute_assignments',
  {
    id: text('id').primaryKey(),
    product_id: text('product_id').notNull(),
    attribute_id: text('attribute_id').notNull(),
    role: text('role').notNull(),
    sort_order: integer('sort_order').notNull(),
    offered_option_ids: text('offered_option_ids').notNull(),
  },
  (table) => ({
    product_attribute_assignments_attribute_id_idx: index(
      'product_attribute_assignments_attribute_id_idx'
    ).on(table.attribute_id),
  })
);

export const product_attribute_values = sqliteTable(
  'product_attribute_values',
  {
    id: text('id').primaryKey(),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    assignment_id: text('assignment_id').notNull(),
    option_id: text('option_id'),
    value_text: text('value_text'),
    value_number: integer('value_number'),
    value_boolean: integer('value_boolean', { mode: 'boolean' }),
  },
  (table) => ({
    product_attribute_values_assignment_id_idx: index(
      'product_attribute_values_assignment_id_idx'
    ).on(table.assignment_id),
    product_attribute_values_option_id_idx: index('product_attribute_values_option_id_idx').on(
      table.option_id
    ),
    product_attribute_values_entity_id_idx: index('product_attribute_values_entity_id_idx').on(
      table.entity_id
    ),
  })
);

export const product_prices = sqliteTable(
  'product_prices',
  {
    id: text('id').primaryKey(),
    product_id: text('product_id'),
    variant_id: text('variant_id'),
    currency: text('currency').notNull(),
    price_net: integer('price_net').notNull(),
  },
  (table) => ({
    product_prices_product_id_idx: index('product_prices_product_id_idx').on(table.product_id),
    product_prices_variant_id_idx: index('product_prices_variant_id_idx').on(table.variant_id),
  })
);

export const translations = sqliteTable(
  'translations',
  {
    id: text('id').primaryKey(),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    locale: text('locale').notNull(),
    name: text('name'),
    description: text('description'),
    slug: text('slug'),
    label: text('label'),
  },
  (table) => ({
    translations_entity_locale_idx: index('translations_entity_locale_idx').on(
      table.entity_type,
      table.entity_id,
      table.locale
    ),
  })
);

export const carts = sqliteTable('carts', {
  id: text('id').primaryKey(),
  session_id: text('session_id').notNull(),
  user_id: text('user_id'),
  applied_voucher_code: text('applied_voucher_code'),
  applied_referral_code: text('applied_referral_code'),
  converted_at: dateType('converted_at'),
  expires_at: dateType('expires_at').notNull(),
  created_at: dateType('created_at').notNull(),
  updated_at: dateType('updated_at').notNull(),
});

export const cart_items = sqliteTable(
  'cart_items',
  {
    id: text('id').primaryKey(),
    cart_id: text('cart_id').notNull(),
    product_id: text('product_id').notNull(),
    variant_id: text('variant_id'),
    quantity: integer('quantity').notNull(),
  },
  (table) => ({
    cart_items_cart_id_idx: index('cart_items_cart_id_idx').on(table.cart_id),
    cart_items_product_id_idx: index('cart_items_product_id_idx').on(table.product_id),
    cart_items_variant_id_idx: index('cart_items_variant_id_idx').on(table.variant_id),
  })
);

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  order_number: text('order_number').notNull().unique(),
  user_id: text('user_id'),
  customer_type: text('customer_type').notNull(),
  customer_email: text('customer_email').notNull(),
  customer_name: text('customer_name').notNull(),
  customer_phone: text('customer_phone'),
  status: text('status').notNull(),
  currency: text('currency').notNull(),
  subtotal_net: integer('subtotal_net').notNull(),
  vat_total: integer('vat_total').notNull(),
  shipping_cost: integer('shipping_cost').notNull(),
  discount_amount: integer('discount_amount').notNull(),
  total: integer('total').notNull(),
  shipping_type: text('shipping_type').notNull(),
  shipping_method: text('shipping_method'),
  voucher_code: text('voucher_code'),
  referral_code: text('referral_code'),
  billing_first_name: text('billing_first_name').notNull(),
  billing_last_name: text('billing_last_name').notNull(),
  billing_address: text('billing_address').notNull(),
  billing_address_extra: text('billing_address_extra'),
  billing_city: text('billing_city').notNull(),
  billing_postal_code: text('billing_postal_code').notNull(),
  billing_country: text('billing_country').notNull(),
  billing_county: text('billing_county'),
  billing_phone: text('billing_phone'),
  billing_company: text('billing_company'),
  billing_vat_number: text('billing_vat_number'),
  shipping_first_name: text('shipping_first_name').notNull(),
  shipping_last_name: text('shipping_last_name').notNull(),
  shipping_address: text('shipping_address').notNull(),
  shipping_address_extra: text('shipping_address_extra'),
  shipping_city: text('shipping_city').notNull(),
  shipping_postal_code: text('shipping_postal_code').notNull(),
  shipping_country: text('shipping_country').notNull(),
  shipping_county: text('shipping_county'),
  shipping_phone: text('shipping_phone'),
  shipping_company: text('shipping_company'),
  shipping_vat_number: text('shipping_vat_number'),
  shipping_same_as_billing: integer('shipping_same_as_billing', { mode: 'boolean' }).notNull(),
  payment_provider: text('payment_provider'),
  payment_intent_id: text('payment_intent_id'),
  transaction_id: text('transaction_id'),
  refund_amount: integer('refund_amount'),
  refund_notes: text('refund_notes'),
  refunded_at: dateType('refunded_at'),
  notes: text('notes'),
  created_at: dateType('created_at').notNull(),
  updated_at: dateType('updated_at').notNull(),
});

export const order_items = sqliteTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    order_id: text('order_id').notNull(),
    product_id: text('product_id'),
    variant_id: text('variant_id'),
    product_name: text('product_name').notNull(),
    sku: text('sku'),
    quantity: integer('quantity').notNull(),
    price_net: integer('price_net').notNull(),
    vat_rate: integer('vat_rate'),
    price_gross: integer('price_gross').notNull(),
    currency: text('currency').notNull(),
  },
  (table) => ({
    order_items_order_id_idx: index('order_items_order_id_idx').on(table.order_id),
    order_items_product_id_idx: index('order_items_product_id_idx').on(table.product_id),
    order_items_variant_id_idx: index('order_items_variant_id_idx').on(table.variant_id),
  })
);

export const order_status_history = sqliteTable(
  'order_status_history',
  {
    id: text('id').primaryKey(),
    order_id: text('order_id').notNull(),
    from_status: text('from_status'),
    to_status: text('to_status').notNull(),
    note: text('note'),
    changed_by: text('changed_by'),
    created_at: dateType('created_at').notNull(),
  },
  (table) => ({
    order_status_history_order_id_idx: index('order_status_history_order_id_idx').on(
      table.order_id
    ),
  })
);

export const order_refunds = sqliteTable(
  'order_refunds',
  {
    id: text('id').primaryKey(),
    order_id: text('order_id').notNull(),
    order_item_id: text('order_item_id').notNull(),
    quantity: integer('quantity').notNull(),
    amount: integer('amount'),
    notes: text('notes'),
    created_at: dateType('created_at').notNull(),
    created_by: text('created_by'),
  },
  (table) => ({
    order_refunds_order_id_idx: index('order_refunds_order_id_idx').on(table.order_id),
    order_refunds_order_item_id_idx: index('order_refunds_order_item_id_idx').on(
      table.order_item_id
    ),
  })
);

export const vouchers = sqliteTable('vouchers', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  type: text('type').notNull(),
  value: integer('value'),
  min_order_value: integer('min_order_value'),
  max_uses: integer('max_uses'),
  uses_count: integer('uses_count').notNull(),
  valid_from: dateType('valid_from'),
  valid_until: dateType('valid_until'),
  single_use_per_customer: integer('single_use_per_customer', { mode: 'boolean' }).notNull(),
  active: integer('active', { mode: 'boolean' }).notNull(),
  created_at: dateType('created_at').notNull(),
  updated_at: dateType('updated_at').notNull(),
});

export const referral_codes = sqliteTable('referral_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  discount_type: text('discount_type'),
  discount_value: integer('discount_value'),
  active: integer('active', { mode: 'boolean' }).notNull(),
  notes: text('notes'),
  created_at: dateType('created_at').notNull(),
  updated_at: dateType('updated_at').notNull(),
});

// All tables are exported via their `export const` declarations above.
