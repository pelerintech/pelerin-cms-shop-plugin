/**
 * pelerin_ro_shop seed — runs automatically on every local dev start.
 * Clears plugin tables and re-inserts fixture data so the dev environment
 * is always predictable.
 */
import { db, sql } from 'astro:db';
import {
  shop_settings,
  categories,
  products,
  product_images,
  product_option_types,
  product_option_values,
  product_variants,
  product_variant_option_values,
  product_prices,
  translations,
  carts,
  cart_items,
  order_items,
  order_status_history,
  orders,
  vouchers,
  referral_codes,
} from './config.ts';

export default async function seed() {
  console.log('[Plugin:pelerin_ro_shop] Seeding...');

  // Clear all plugin tables in FK-safe order (children first)
  await db.run(sql`DELETE FROM product_variant_option_values`);
  await db.run(sql`DELETE FROM product_variants`);
  await db.run(sql`DELETE FROM product_option_values`);
  await db.run(sql`DELETE FROM product_option_types`);
  await db.run(sql`DELETE FROM product_prices`);
  await db.run(sql`DELETE FROM product_images`);
  await db.run(sql`DELETE FROM translations`);
  await db.run(sql`DELETE FROM products`);
  await db.run(sql`DELETE FROM categories`);
  await db.run(sql`DELETE FROM cart_items`);
  await db.run(sql`DELETE FROM carts`);
  await db.run(sql`DELETE FROM order_items`);
  await db.run(sql`DELETE FROM order_status_history`);
  await db.run(sql`DELETE FROM orders`);
  await db.run(sql`DELETE FROM vouchers`);
  await db.run(sql`DELETE FROM referral_codes`);
  await db.run(sql`DELETE FROM shop_settings`);

  // ─── Settings (locales, currencies, order config) ───
  await db.insert(shop_settings).values([
    {
      id: crypto.randomUUID(),
      key: 'locales',
      value: JSON.stringify([
        { code: 'ro', name: 'Română', isDefault: true },
        { code: 'en', name: 'English', isDefault: false },
      ]),
    },
    {
      id: crypto.randomUUID(),
      key: 'currencies',
      value: JSON.stringify([
        { code: 'RON', name: 'Leu românesc', isDefault: true },
        { code: 'EUR', name: 'Euro', isDefault: false },
      ]),
    },
    { id: crypto.randomUUID(), key: 'order_number_prefix', value: 'ORD' },
    { id: crypto.randomUUID(), key: 'order_number_year', value: new Date().getFullYear().toString() },
    { id: crypto.randomUUID(), key: 'order_number_padding', value: '6' },
    { id: crypto.randomUUID(), key: 'order_number_sequence', value: '0' },
  ]);

  console.log('[Plugin:pelerin_ro_shop] Seeded core data.');

  // ─── Categories ───
  const catElectronics = crypto.randomUUID();
  const catPhones = crypto.randomUUID();

  await db.insert(categories).values([
    { id: catElectronics, parent_id: null, name: 'Electronice', description: 'Produse electronice', slug: 'electronice', sort_order: 1 },
    { id: catPhones, parent_id: catElectronics, name: 'Telefoane', description: 'Telefoane mobile', slug: 'telefoane', sort_order: 1 },
  ]);

  await db.insert(translations).values([
    // Romanian (default locale) — mirrored into translations for completeness
    { id: crypto.randomUUID(), entity_type: 'category', entity_id: catElectronics, locale: 'ro', name: 'Electronice', description: 'Produse electronice', slug: 'electronice', label: null },
    { id: crypto.randomUUID(), entity_type: 'category', entity_id: catPhones, locale: 'ro', name: 'Telefoane', description: 'Telefoane mobile', slug: 'telefoane', label: null },
    // English translations
    { id: crypto.randomUUID(), entity_type: 'category', entity_id: catElectronics, locale: 'en', name: 'Electronics', description: 'Electronic products', slug: 'electronics', label: null },
    { id: crypto.randomUUID(), entity_type: 'category', entity_id: catPhones, locale: 'en', name: 'Phones', description: 'Mobile phones', slug: 'phones', label: null },
  ]);

  // ─── Products ───
  const prodSimple = crypto.randomUUID();
  const prodVariant = crypto.randomUUID();

  await db.insert(products).values([
    { id: prodSimple, sku: 'BOOK-001', type: 'physical', has_variants: false, vat_rate: 0.05, stock: 100, category_id: catElectronics, active: true, name: 'Carte de programare', description: 'O carte excelentă', slug: 'carte-programare' },
    { id: prodVariant, sku: null, type: 'physical', has_variants: true, vat_rate: 0.19, stock: null, category_id: catPhones, active: true, name: 'Telefon Smart X', description: 'Telefon inteligent', slug: 'telefon-smart-x' },
  ]);

  await db.insert(translations).values([
    // Romanian (default locale) — mirrored into translations for completeness
    { id: crypto.randomUUID(), entity_type: 'product', entity_id: prodSimple, locale: 'ro', name: 'Carte de programare', description: 'O carte excelentă', slug: 'carte-programare', label: null },
    { id: crypto.randomUUID(), entity_type: 'product', entity_id: prodVariant, locale: 'ro', name: 'Telefon Smart X', description: 'Telefon inteligent', slug: 'telefon-smart-x', label: null },
    // English translations
    { id: crypto.randomUUID(), entity_type: 'product', entity_id: prodSimple, locale: 'en', name: 'Programming Book', description: 'An excellent book', slug: 'programming-book', label: null },
    { id: crypto.randomUUID(), entity_type: 'product', entity_id: prodVariant, locale: 'en', name: 'Smart Phone X', description: 'A smart phone', slug: 'smart-phone-x', label: null },
  ]);

  await db.insert(product_prices).values([
    { id: crypto.randomUUID(), product_id: prodSimple, variant_id: null, currency: 'RON', price_net: 5000 },
    { id: crypto.randomUUID(), product_id: prodSimple, variant_id: null, currency: 'EUR', price_net: 1000 },
  ]);

  // ─── Product with variants ───
  const optTypeColor = crypto.randomUUID();
  const optTypeStorage = crypto.randomUUID();

  await db.insert(product_option_types).values([
    { id: optTypeColor, product_id: prodVariant, label: 'Culoare', value_type: 'short_text', sort_order: 1 },
    { id: optTypeStorage, product_id: prodVariant, label: 'Stocare', value_type: 'short_text', sort_order: 2 },
  ]);

  await db.insert(translations).values([
    { id: crypto.randomUUID(), entity_type: 'option_type', entity_id: optTypeColor, locale: 'en', name: null, description: null, slug: null, label: 'Color' },
    { id: crypto.randomUUID(), entity_type: 'option_type', entity_id: optTypeStorage, locale: 'en', name: null, description: null, slug: null, label: 'Storage' },
  ]);

  const optValBlack = crypto.randomUUID();
  const optValWhite = crypto.randomUUID();
  const optVal128 = crypto.randomUUID();
  const optVal256 = crypto.randomUUID();

  await db.insert(product_option_values).values([
    { id: optValBlack, option_type_id: optTypeColor, value: 'black', label: 'Negru', sort_order: 1 },
    { id: optValWhite, option_type_id: optTypeColor, value: 'white', label: 'Alb', sort_order: 2 },
    { id: optVal128, option_type_id: optTypeStorage, value: '128GB', label: '128 GB', sort_order: 1 },
    { id: optVal256, option_type_id: optTypeStorage, value: '256GB', label: '256 GB', sort_order: 2 },
  ]);

  await db.insert(translations).values([
    { id: crypto.randomUUID(), entity_type: 'option_value', entity_id: optValBlack, locale: 'en', name: null, description: null, slug: null, label: 'Black' },
    { id: crypto.randomUUID(), entity_type: 'option_value', entity_id: optValWhite, locale: 'en', name: null, description: null, slug: null, label: 'White' },
    { id: crypto.randomUUID(), entity_type: 'option_value', entity_id: optVal128, locale: 'en', name: null, description: null, slug: null, label: '128 GB' },
    { id: crypto.randomUUID(), entity_type: 'option_value', entity_id: optVal256, locale: 'en', name: null, description: null, slug: null, label: '256 GB' },
  ]);

  const varBlack128 = crypto.randomUUID();
  const varWhite256 = crypto.randomUUID();

  await db.insert(product_variants).values([
    { id: varBlack128, product_id: prodVariant, sku: 'SMX-BLK-128', stock: 50, active: true },
    { id: varWhite256, product_id: prodVariant, sku: 'SMX-WHT-256', stock: 30, active: true },
  ]);

  await db.insert(product_variant_option_values).values([
    { id: crypto.randomUUID(), variant_id: varBlack128, option_value_id: optValBlack },
    { id: crypto.randomUUID(), variant_id: varBlack128, option_value_id: optVal128 },
    { id: crypto.randomUUID(), variant_id: varWhite256, option_value_id: optValWhite },
    { id: crypto.randomUUID(), variant_id: varWhite256, option_value_id: optVal256 },
  ]);

  await db.insert(product_prices).values([
    { id: crypto.randomUUID(), product_id: null, variant_id: varBlack128, currency: 'RON', price_net: 25000 },
    { id: crypto.randomUUID(), product_id: null, variant_id: varBlack128, currency: 'EUR', price_net: 5000 },
    { id: crypto.randomUUID(), product_id: null, variant_id: varWhite256, currency: 'RON', price_net: 30000 },
    { id: crypto.randomUUID(), product_id: null, variant_id: varWhite256, currency: 'EUR', price_net: 6000 },
  ]);

  console.log('[Plugin:pelerin_ro_shop] Seeded products and categories.');

  // ─── Vouchers ───
  await db.insert(vouchers).values([
    { id: crypto.randomUUID(), code: 'SAVE10', type: 'fixed_amount', value: 1000, min_order_value: 5000, max_uses: 100, uses_count: 0, valid_from: null, valid_until: null, single_use_per_customer: false, active: true, created_at: new Date(), updated_at: new Date() },
    { id: crypto.randomUUID(), code: 'PCT20', type: 'percentage', value: 20, min_order_value: null, max_uses: null, uses_count: 0, valid_from: null, valid_until: null, single_use_per_customer: true, active: true, created_at: new Date(), updated_at: new Date() },
    { id: crypto.randomUUID(), code: 'FREESHIP', type: 'free_shipping', value: null, min_order_value: 10000, max_uses: 50, uses_count: 0, valid_from: null, valid_until: null, single_use_per_customer: false, active: true, created_at: new Date(), updated_at: new Date() },
  ]);

  // ─── Referral codes ───
  await db.insert(referral_codes).values([
    { id: crypto.randomUUID(), code: 'PARTNER10', name: 'Partner A', discount_type: 'percentage', discount_value: 10, active: true, notes: null, created_at: new Date(), updated_at: new Date() },
  ]);

  console.log('[Plugin:pelerin_ro_shop] Seeded vouchers and referral codes.');
}
