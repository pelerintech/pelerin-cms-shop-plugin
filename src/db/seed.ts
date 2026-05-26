/**
 * pelerin_ro_shop seed — runs automatically on every local dev start.
 * Clears plugin tables and re-inserts fixture data so the dev environment
 * is always predictable.
 */
import { db, sql } from 'astro:db';

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
  await db.run(sql`
    INSERT INTO shop_settings (id, key, value) VALUES
      (${crypto.randomUUID()}, 'locales', ${JSON.stringify([{ code: 'ro', name: 'Română', isDefault: true }, { code: 'en', name: 'English', isDefault: false }])}),
      (${crypto.randomUUID()}, 'currencies', ${JSON.stringify([{ code: 'RON', name: 'Leu românesc', isDefault: true }, { code: 'EUR', name: 'Euro', isDefault: false }])}),
      (${crypto.randomUUID()}, 'order_number_prefix', 'ORD'),
      (${crypto.randomUUID()}, 'order_number_year', ${new Date().getFullYear().toString()}),
      (${crypto.randomUUID()}, 'order_number_padding', '6'),
      (${crypto.randomUUID()}, 'order_number_sequence', '0')
  `);

  console.log('[Plugin:pelerin_ro_shop] Seeded core data.');

  // ─── Categories ───
  const catElectronics = crypto.randomUUID();
  const catPhones = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO categories (id, parent_id, name, description, slug, sort_order) VALUES
      (${catElectronics}, NULL, 'Electronice', 'Produse electronice', 'electronice', 1),
      (${catPhones}, ${catElectronics}, 'Telefoane', 'Telefoane mobile', 'telefoane', 1)
  `);

  await db.run(sql`
    INSERT INTO translations (id, entity_type, entity_id, locale, name, description, slug, label) VALUES
      (${crypto.randomUUID()}, 'category', ${catElectronics}, 'ro', 'Electronice', 'Produse electronice', 'electronice', NULL),
      (${crypto.randomUUID()}, 'category', ${catPhones}, 'ro', 'Telefoane', 'Telefoane mobile', 'telefoane', NULL),
      (${crypto.randomUUID()}, 'category', ${catElectronics}, 'en', 'Electronics', 'Electronic products', 'electronics', NULL),
      (${crypto.randomUUID()}, 'category', ${catPhones}, 'en', 'Phones', 'Mobile phones', 'phones', NULL)
  `);

  // ─── Products ───
  const prodSimple = crypto.randomUUID();
  const prodVariant = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO products (id, sku, type, has_variants, vat_rate, stock, category_id, active, name, description, slug) VALUES
      (${prodSimple}, 'BOOK-001', 'physical', 0, 0.05, 100, ${catElectronics}, 1, 'Carte de programare', 'O carte excelentă', 'carte-programare'),
      (${prodVariant}, NULL, 'physical', 1, 0.19, NULL, ${catPhones}, 1, 'Telefon Smart X', 'Telefon inteligent', 'telefon-smart-x')
  `);

  await db.run(sql`
    INSERT INTO translations (id, entity_type, entity_id, locale, name, description, slug, label) VALUES
      (${crypto.randomUUID()}, 'product', ${prodSimple}, 'ro', 'Carte de programare', 'O carte excelentă', 'carte-programare', NULL),
      (${crypto.randomUUID()}, 'product', ${prodVariant}, 'ro', 'Telefon Smart X', 'Telefon inteligent', 'telefon-smart-x', NULL),
      (${crypto.randomUUID()}, 'product', ${prodSimple}, 'en', 'Programming Book', 'An excellent book', 'programming-book', NULL),
      (${crypto.randomUUID()}, 'product', ${prodVariant}, 'en', 'Smart Phone X', 'A smart phone', 'smart-phone-x', NULL)
  `);

  await db.run(sql`
    INSERT INTO product_prices (id, product_id, variant_id, currency, price_net) VALUES
      (${crypto.randomUUID()}, ${prodSimple}, NULL, 'RON', 5000),
      (${crypto.randomUUID()}, ${prodSimple}, NULL, 'EUR', 1000)
  `);

  // ─── Product with variants ───
  const optTypeColor = crypto.randomUUID();
  const optTypeStorage = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO product_option_types (id, product_id, label, value_type, sort_order) VALUES
      (${optTypeColor}, ${prodVariant}, 'Culoare', 'short_text', 1),
      (${optTypeStorage}, ${prodVariant}, 'Stocare', 'short_text', 2)
  `);

  await db.run(sql`
    INSERT INTO translations (id, entity_type, entity_id, locale, name, description, slug, label) VALUES
      (${crypto.randomUUID()}, 'option_type', ${optTypeColor}, 'en', NULL, NULL, NULL, 'Color'),
      (${crypto.randomUUID()}, 'option_type', ${optTypeStorage}, 'en', NULL, NULL, NULL, 'Storage')
  `);

  const optValBlack = crypto.randomUUID();
  const optValWhite = crypto.randomUUID();
  const optVal128 = crypto.randomUUID();
  const optVal256 = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO product_option_values (id, option_type_id, value, label, sort_order) VALUES
      (${optValBlack}, ${optTypeColor}, 'black', 'Negru', 1),
      (${optValWhite}, ${optTypeColor}, 'white', 'Alb', 2),
      (${optVal128}, ${optTypeStorage}, '128GB', '128 GB', 1),
      (${optVal256}, ${optTypeStorage}, '256GB', '256 GB', 2)
  `);

  await db.run(sql`
    INSERT INTO translations (id, entity_type, entity_id, locale, name, description, slug, label) VALUES
      (${crypto.randomUUID()}, 'option_value', ${optValBlack}, 'en', NULL, NULL, NULL, 'Black'),
      (${crypto.randomUUID()}, 'option_value', ${optValWhite}, 'en', NULL, NULL, NULL, 'White'),
      (${crypto.randomUUID()}, 'option_value', ${optVal128}, 'en', NULL, NULL, NULL, '128 GB'),
      (${crypto.randomUUID()}, 'option_value', ${optVal256}, 'en', NULL, NULL, NULL, '256 GB')
  `);

  const varBlack128 = crypto.randomUUID();
  const varWhite256 = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO product_variants (id, product_id, sku, stock, active) VALUES
      (${varBlack128}, ${prodVariant}, 'SMX-BLK-128', 50, 1),
      (${varWhite256}, ${prodVariant}, 'SMX-WHT-256', 30, 1)
  `);

  await db.run(sql`
    INSERT INTO product_variant_option_values (id, variant_id, option_value_id) VALUES
      (${crypto.randomUUID()}, ${varBlack128}, ${optValBlack}),
      (${crypto.randomUUID()}, ${varBlack128}, ${optVal128}),
      (${crypto.randomUUID()}, ${varWhite256}, ${optValWhite}),
      (${crypto.randomUUID()}, ${varWhite256}, ${optVal256})
  `);

  await db.run(sql`
    INSERT INTO product_prices (id, product_id, variant_id, currency, price_net) VALUES
      (${crypto.randomUUID()}, NULL, ${varBlack128}, 'RON', 25000),
      (${crypto.randomUUID()}, NULL, ${varBlack128}, 'EUR', 5000),
      (${crypto.randomUUID()}, NULL, ${varWhite256}, 'RON', 30000),
      (${crypto.randomUUID()}, NULL, ${varWhite256}, 'EUR', 6000)
  `);

  console.log('[Plugin:pelerin_ro_shop] Seeded products and categories.');

  // ─── Vouchers ───
  await db.run(sql`
    INSERT INTO vouchers (id, code, type, value, min_order_value, max_uses, uses_count, valid_from, valid_until, single_use_per_customer, active, created_at, updated_at) VALUES
      (${crypto.randomUUID()}, 'SAVE10', 'fixed_amount', 1000, 5000, 100, 0, NULL, NULL, 0, 1, ${new Date().toISOString()}, ${new Date().toISOString()}),
      (${crypto.randomUUID()}, 'PCT20', 'percentage', 20, NULL, NULL, 0, NULL, NULL, 1, 1, ${new Date().toISOString()}, ${new Date().toISOString()}),
      (${crypto.randomUUID()}, 'FREESHIP', 'free_shipping', NULL, 10000, 50, 0, NULL, NULL, 0, 1, ${new Date().toISOString()}, ${new Date().toISOString()})
  `);

  // ─── Referral codes ───
  await db.run(sql`
    INSERT INTO referral_codes (id, code, name, discount_type, discount_value, active, notes, created_at, updated_at) VALUES
      (${crypto.randomUUID()}, 'PARTNER10', 'Partner A', 'percentage', 10, 1, NULL, ${new Date().toISOString()}, ${new Date().toISOString()})
  `);

  console.log('[Plugin:pelerin_ro_shop] Seeded vouchers and referral codes.');
}
