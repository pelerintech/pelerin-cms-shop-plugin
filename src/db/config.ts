import { defineDb, defineTable, column } from 'astro:db';

const shop_settings = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    key: column.text({ unique: true }),
    value: column.text(),
  },
});

const categories = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    parent_id: column.text({ optional: true }),
    name: column.text(),
    description: column.text({ optional: true }),
    slug: column.text({ unique: true }),
    sort_order: column.number(),
    created_at: column.date({ mode: 'timestamp', optional: true }),
    updated_at: column.date({ mode: 'timestamp', optional: true }),
  },
  indexes: {
    categories_parent_id_idx: { on: 'parent_id' },
  },
});

const products = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    sku: column.text({ optional: true, unique: true }),
    type: column.text(),
    has_variants: column.boolean(),
    vat_rate: column.number({ optional: true }),
    stock: column.number({ optional: true }),
    category_id: column.text({ optional: true }),
    active: column.boolean(),
    name: column.text(),
    description: column.text({ optional: true }),
    slug: column.text({ unique: true }),
    created_at: column.date({ mode: 'timestamp' }),
    updated_at: column.date({ mode: 'timestamp', optional: true }),
  },
});

const product_images = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    product_id: column.text(),
    variant_id: column.text({ optional: true }),
    url: column.text(), // holds a storage KEY (not a URL); resolved to URL at the accessor layer (design D2)
    alt: column.text({ optional: true }),
    sort_order: column.number(),
    mime: column.text(),
    size: column.number(),
    width: column.number({ optional: true }),
    height: column.number({ optional: true }),
    original_filename: column.text({ optional: true }),
  },
  indexes: {
    product_images_product_id_idx: { on: 'product_id' },
  },
});

const product_variants = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    product_id: column.text(),
    sku: column.text({ optional: true }),
    stock: column.number({ optional: true }),
    active: column.boolean(),
  },
  indexes: {
    product_variants_product_id_idx: { on: 'product_id' },
  },
});

const product_attributes = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    name: column.text(),
    type: column.text(),
    sort_order: column.number(),
  },
});

const product_attribute_options = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    attribute_id: column.text(),
    value: column.text(),
    sort_order: column.number(),
  },
});

const product_attribute_assignments = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    product_id: column.text(),
    attribute_id: column.text(),
    role: column.text(),
    sort_order: column.number(),
    offered_option_ids: column.text(),
  },
  indexes: {
    product_attribute_assignments_attribute_id_idx: { on: 'attribute_id' },
  },
});

const product_attribute_values = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    entity_type: column.text(),
    entity_id: column.text(),
    assignment_id: column.text(),
    option_id: column.text({ optional: true }),
    value_text: column.text({ optional: true }),
    value_number: column.number({ optional: true }),
    value_boolean: column.boolean({ optional: true }),
  },
  indexes: {
    product_attribute_values_assignment_id_idx: { on: 'assignment_id' },
    product_attribute_values_option_id_idx: { on: 'option_id' },
    product_attribute_values_entity_id_idx: { on: 'entity_id' },
  },
});

const product_prices = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    product_id: column.text({ optional: true }),
    variant_id: column.text({ optional: true }),
    currency: column.text(),
    price_net: column.number(),
  },
  indexes: {
    product_prices_product_id_idx: { on: 'product_id' },
    product_prices_variant_id_idx: { on: 'variant_id' },
  },
});

const translations = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    entity_type: column.text(),
    entity_id: column.text(),
    locale: column.text(),
    name: column.text({ optional: true }),
    description: column.text({ optional: true }),
    slug: column.text({ optional: true }),
    label: column.text({ optional: true }),
  },
  indexes: {
    translations_entity_locale_idx: { on: ['entity_type', 'entity_id', 'locale'] },
  },
});

const carts = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    session_id: column.text(),
    user_id: column.text({ optional: true }),
    applied_voucher_code: column.text({ optional: true }),
    applied_referral_code: column.text({ optional: true }),
    converted_at: column.date({ optional: true }),
    expires_at: column.date(),
    created_at: column.date(),
    updated_at: column.date(),
  },
});

const cart_items = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    cart_id: column.text(),
    product_id: column.text(),
    variant_id: column.text({ optional: true }),
    quantity: column.number(),
  },
  indexes: {
    cart_items_cart_id_idx: { on: 'cart_id' },
    cart_items_product_id_idx: { on: 'product_id' },
    cart_items_variant_id_idx: { on: 'variant_id' },
  },
});

const orders = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    order_number: column.text({ unique: true }),
    user_id: column.text({ optional: true }),
    customer_type: column.text(),
    customer_email: column.text(),
    customer_name: column.text(),
    customer_phone: column.text({ optional: true }),
    status: column.text(),
    currency: column.text(),
    subtotal_net: column.number(),
    vat_total: column.number(),
    shipping_cost: column.number(),
    discount_amount: column.number(),
    total: column.number(),
    shipping_type: column.text(),
    shipping_method: column.text({ optional: true }),
    voucher_code: column.text({ optional: true }),
    referral_code: column.text({ optional: true }),
    billing_first_name: column.text(),
    billing_last_name: column.text(),
    billing_address: column.text(),
    billing_address_extra: column.text({ optional: true }),
    billing_city: column.text(),
    billing_postal_code: column.text(),
    billing_country: column.text(),
    billing_county: column.text({ optional: true }),
    billing_phone: column.text({ optional: true }),
    billing_company: column.text({ optional: true }),
    billing_vat_number: column.text({ optional: true }),
    shipping_first_name: column.text(),
    shipping_last_name: column.text(),
    shipping_address: column.text(),
    shipping_address_extra: column.text({ optional: true }),
    shipping_city: column.text(),
    shipping_postal_code: column.text(),
    shipping_country: column.text(),
    shipping_county: column.text({ optional: true }),
    shipping_phone: column.text({ optional: true }),
    shipping_company: column.text({ optional: true }),
    shipping_vat_number: column.text({ optional: true }),
    shipping_same_as_billing: column.boolean(),
    payment_provider: column.text({ optional: true }),
    payment_intent_id: column.text({ optional: true }),
    transaction_id: column.text({ optional: true }),
    refund_amount: column.number({ optional: true }),
    refund_notes: column.text({ optional: true }),
    refunded_at: column.date({ optional: true }),
    notes: column.text({ optional: true }),
    created_at: column.date(),
    updated_at: column.date(),
  },
});

const order_items = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    order_id: column.text(),
    product_id: column.text({ optional: true }),
    variant_id: column.text({ optional: true }),
    product_name: column.text(),
    sku: column.text({ optional: true }),
    quantity: column.number(),
    price_net: column.number(),
    vat_rate: column.number({ optional: true }),
    price_gross: column.number(),
    currency: column.text(),
  },
  indexes: {
    order_items_order_id_idx: { on: 'order_id' },
    order_items_product_id_idx: { on: 'product_id' },
    order_items_variant_id_idx: { on: 'variant_id' },
  },
});

const order_status_history = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    order_id: column.text(),
    from_status: column.text({ optional: true }),
    to_status: column.text(),
    note: column.text({ optional: true }),
    changed_by: column.text({ optional: true }),
    created_at: column.date(),
  },
  indexes: {
    order_status_history_order_id_idx: { on: 'order_id' },
  },
});

const order_refunds = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    order_id: column.text(),
    order_item_id: column.text(),
    quantity: column.number(),
    amount: column.number({ optional: true }),
    notes: column.text({ optional: true }),
    created_at: column.date(),
    created_by: column.text({ optional: true }),
  },
  indexes: {
    order_refunds_order_id_idx: { on: 'order_id' },
    order_refunds_order_item_id_idx: { on: 'order_item_id' },
  },
});

const vouchers = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    code: column.text({ unique: true }),
    type: column.text(),
    value: column.number({ optional: true }),
    min_order_value: column.number({ optional: true }),
    max_uses: column.number({ optional: true }),
    uses_count: column.number(),
    valid_from: column.date({ optional: true }),
    valid_until: column.date({ optional: true }),
    single_use_per_customer: column.boolean(),
    active: column.boolean(),
    created_at: column.date(),
    updated_at: column.date(),
  },
});

const referral_codes = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    code: column.text({ unique: true }),
    name: column.text(),
    discount_type: column.text({ optional: true }),
    discount_value: column.number({ optional: true }),
    active: column.boolean(),
    notes: column.text({ optional: true }),
    created_at: column.date(),
    updated_at: column.date(),
  },
});

export {
  shop_settings,
  categories,
  products,
  product_images,
  product_variants,
  product_attributes,
  product_attribute_options,
  product_attribute_assignments,
  product_attribute_values,
  product_prices,
  translations,
  carts,
  cart_items,
  orders,
  order_items,
  order_status_history,
  order_refunds,
  vouchers,
  referral_codes,
};

export default defineDb({
  tables: {
    shop_settings,
    categories,
    products,
    product_images,
    product_variants,
    product_attributes,
    product_attribute_options,
    product_attribute_assignments,
    product_attribute_values,
    product_prices,
    translations,
    carts,
    cart_items,
    orders,
    order_items,
    order_status_history,
    order_refunds,
    vouchers,
    referral_codes,
  },
});
