/**
 * pelerin_ro_shop seed — runs automatically on every local dev start.
 * Clears plugin tables and re-inserts fixture data so the dev environment
 * is always predictable.
 */
import { db, sql } from 'astro:db';

export default async function seed() {
  console.log('[Plugin:pelerin_ro_shop] Seeding...');

  // Clear all plugin tables in FK-safe order (children first)
  await db.run(sql`DELETE FROM product_attribute_values`);
  await db.run(sql`DELETE FROM product_attribute_assignments`);
  await db.run(sql`DELETE FROM product_attribute_options`);
  await db.run(sql`DELETE FROM product_attributes`);
  await db.run(sql`DELETE FROM product_variants`);
  await db.run(sql`DELETE FROM product_prices`);
  await db.run(sql`DELETE FROM product_images`);
  await db.run(sql`DELETE FROM translations`);
  await db.run(sql`DELETE FROM products`);
  await db.run(sql`DELETE FROM categories`);
  await db.run(sql`DELETE FROM cart_items`);
  await db.run(sql`DELETE FROM carts`);
  await db.run(sql`DELETE FROM order_refunds`);
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
      (${crypto.randomUUID()}, 'order_number_year', 'true'),
      (${crypto.randomUUID()}, 'order_number_padding', '6'),
      (${crypto.randomUUID()}, 'order_number_sequence', '0')
  `);

  console.log('[Plugin:pelerin_ro_shop] Seeded core data.');

  // ─── Categories ───
  const catElectronics = crypto.randomUUID();
  const catPhones = crypto.randomUUID();
  const catBooks = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO categories (id, parent_id, name, description, slug, sort_order) VALUES
      (${catElectronics}, NULL, 'Electronice', 'Produse electronice', 'electronice', 1),
      (${catPhones}, ${catElectronics}, 'Telefoane', 'Telefoane mobile', 'telefoane', 1),
      (${catBooks}, NULL, 'Cărți', 'Cărți de specialitate', 'carti', 2)
  `);

  await db.run(sql`
    INSERT INTO translations (id, entity_type, entity_id, locale, name, description, slug, label) VALUES
      (${crypto.randomUUID()}, 'category', ${catElectronics}, 'ro', 'Electronice', 'Produse electronice', 'electronice', NULL),
      (${crypto.randomUUID()}, 'category', ${catPhones}, 'ro', 'Telefoane', 'Telefoane mobile', 'telefoane', NULL),
      (${crypto.randomUUID()}, 'category', ${catBooks}, 'ro', 'Cărți', 'Cărți de specialitate', 'carti', NULL),
      (${crypto.randomUUID()}, 'category', ${catElectronics}, 'en', 'Electronics', 'Electronic products', 'electronics', NULL),
      (${crypto.randomUUID()}, 'category', ${catPhones}, 'en', 'Phones', 'Mobile phones', 'phones', NULL),
      (${crypto.randomUUID()}, 'category', ${catBooks}, 'en', 'Books', 'Specialty books', 'books', NULL)
  `);

  // ─── Global Attributes ───
  const attrColor = crypto.randomUUID();
  const attrStorage = crypto.randomUUID();
  const attrBrand = crypto.randomUUID();
  const attrWeight = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO product_attributes (id, name, type, sort_order) VALUES
      (${attrColor}, 'Culoare', 'select', 1),
      (${attrStorage}, 'Stocare', 'select', 2),
      (${attrBrand}, 'Brand', 'text', 3),
      (${attrWeight}, 'Greutate', 'number', 4)
  `);

  // Translations for attribute names
  await db.run(sql`
    INSERT INTO translations (id, entity_type, entity_id, locale, name, description, slug, label) VALUES
      (${crypto.randomUUID()}, 'product_attribute', ${attrColor}, 'en', 'Color', NULL, NULL, NULL),
      (${crypto.randomUUID()}, 'product_attribute', ${attrStorage}, 'en', 'Storage', NULL, NULL, NULL),
      (${crypto.randomUUID()}, 'product_attribute', ${attrBrand}, 'en', 'Brand', NULL, NULL, NULL),
      (${crypto.randomUUID()}, 'product_attribute', ${attrWeight}, 'en', 'Weight', NULL, NULL, NULL)
  `);

  // ─── Attribute Options (select-type attributes) ───
  const optColorBlack = crypto.randomUUID();
  const optColorWhite = crypto.randomUUID();
  const optColorRed = crypto.randomUUID();
  const optStorage128 = crypto.randomUUID();
  const optStorage256 = crypto.randomUUID();
  const optStorage512 = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO product_attribute_options (id, attribute_id, value, sort_order) VALUES
      (${optColorBlack}, ${attrColor}, 'black', 1),
      (${optColorWhite}, ${attrColor}, 'white', 2),
      (${optColorRed}, ${attrColor}, 'red', 3),
      (${optStorage128}, ${attrStorage}, '128GB', 1),
      (${optStorage256}, ${attrStorage}, '256GB', 2),
      (${optStorage512}, ${attrStorage}, '512GB', 3)
  `);

  // Translations for option labels
  await db.run(sql`
    INSERT INTO translations (id, entity_type, entity_id, locale, name, description, slug, label) VALUES
      (${crypto.randomUUID()}, 'product_attribute_option', ${optColorBlack}, 'ro', NULL, NULL, NULL, 'Negru'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optColorWhite}, 'ro', NULL, NULL, NULL, 'Alb'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optColorRed}, 'ro', NULL, NULL, NULL, 'Roșu'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optColorBlack}, 'en', NULL, NULL, NULL, 'Black'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optColorWhite}, 'en', NULL, NULL, NULL, 'White'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optColorRed}, 'en', NULL, NULL, NULL, 'Red'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optStorage128}, 'ro', NULL, NULL, NULL, '128 GB'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optStorage256}, 'ro', NULL, NULL, NULL, '256 GB'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optStorage512}, 'ro', NULL, NULL, NULL, '512 GB'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optStorage128}, 'en', NULL, NULL, NULL, '128 GB'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optStorage256}, 'en', NULL, NULL, NULL, '256 GB'),
      (${crypto.randomUUID()}, 'product_attribute_option', ${optStorage512}, 'en', NULL, NULL, NULL, '512 GB')
  `);

  // ─── Products ───
  const prodSimple = crypto.randomUUID();
  const prodVariant = crypto.randomUUID();

  const now = new Date().toISOString();
  await db.run(sql`
    INSERT INTO products (id, sku, type, has_variants, vat_rate, stock, category_id, active, name, description, slug, created_at, updated_at) VALUES
      (${prodSimple}, 'BOOK-001', 'physical', 0, 0.05, 100, ${catBooks}, 1, 'Carte de programare', 'O carte excelentă', 'carte-programare', ${now}, ${now}),
      (${prodVariant}, NULL, 'physical', 1, 0.19, NULL, ${catPhones}, 1, 'Telefon Smart X', 'Telefon inteligent', 'telefon-smart-x', ${now}, ${now})
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
      (${crypto.randomUUID()}, ${prodSimple}, NULL, 'EUR', 1000),
      -- Variant product-level prices (the inheritance baseline). Variants inherit
      -- a currency when they have no own row for it (see varWhite256 EUR below).
      (${crypto.randomUUID()}, ${prodVariant}, NULL, 'RON', 24000),
      (${crypto.randomUUID()}, ${prodVariant}, NULL, 'EUR', 4800)
  `);

  // ─── Attribute Assignments ───

  // Simple product: Brand (field), Weight (field)
  const assignSimpleBrand = crypto.randomUUID();
  const assignSimpleWeight = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO product_attribute_assignments (id, product_id, attribute_id, role, sort_order, offered_option_ids) VALUES
      (${assignSimpleBrand}, ${prodSimple}, ${attrBrand}, 'field', 1, '[]'),
      (${assignSimpleWeight}, ${prodSimple}, ${attrWeight}, 'field', 2, '[]')
  `);

  // Variant product: Color (dimension, offered: Black, White), Storage (dimension, offered: 128GB, 256GB), Brand (field)
  const assignVariantColor = crypto.randomUUID();
  const assignVariantStorage = crypto.randomUUID();
  const assignVariantBrand = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO product_attribute_assignments (id, product_id, attribute_id, role, sort_order, offered_option_ids) VALUES
      (${assignVariantColor}, ${prodVariant}, ${attrColor}, 'dimension', 1, '[]'),
      (${assignVariantStorage}, ${prodVariant}, ${attrStorage}, 'dimension', 2, '[]'),
      (${assignVariantBrand}, ${prodVariant}, ${attrBrand}, 'field', 3, '[]')
  `);

  // ─── Product-level Attribute Values (field-role) ───

  // Simple product: Brand = "Pelerin Press", Weight = 0.5
  await db.run(sql`
    INSERT INTO product_attribute_values (id, entity_type, entity_id, assignment_id, option_id, value_text, value_number, value_boolean) VALUES
      (${crypto.randomUUID()}, 'product', ${prodSimple}, ${assignSimpleBrand}, NULL, 'Pelerin Press', NULL, NULL),
      (${crypto.randomUUID()}, 'product', ${prodSimple}, ${assignSimpleWeight}, NULL, NULL, 0.5, NULL)
  `);

  // Variant product: Brand = "SmartTech"
  await db.run(sql`
    INSERT INTO product_attribute_values (id, entity_type, entity_id, assignment_id, option_id, value_text, value_number, value_boolean) VALUES
      (${crypto.randomUUID()}, 'product', ${prodVariant}, ${assignVariantBrand}, NULL, 'SmartTech', NULL, NULL)
  `);

  // ─── Variants ───
  const varBlack128 = crypto.randomUUID();
  const varWhite256 = crypto.randomUUID();

  await db.run(sql`
    INSERT INTO product_variants (id, product_id, sku, stock, active) VALUES
      (${varBlack128}, ${prodVariant}, 'SMX-BLK-128', 50, 1),
      (${varWhite256}, ${prodVariant}, 'SMX-WHT-256', 30, 1)
  `);

  // Variant-level attribute values (dimension values for each variant)
  // Black/128 variant: Color=black, Storage=128GB
  await db.run(sql`
    INSERT INTO product_attribute_values (id, entity_type, entity_id, assignment_id, option_id, value_text, value_number, value_boolean) VALUES
      (${crypto.randomUUID()}, 'variant', ${varBlack128}, ${assignVariantColor}, ${optColorBlack}, NULL, NULL, NULL),
      (${crypto.randomUUID()}, 'variant', ${varBlack128}, ${assignVariantStorage}, ${optStorage128}, NULL, NULL, NULL)
  `);

  // White/256 variant: Color=white, Storage=256GB
  await db.run(sql`
    INSERT INTO product_attribute_values (id, entity_type, entity_id, assignment_id, option_id, value_text, value_number, value_boolean) VALUES
      (${crypto.randomUUID()}, 'variant', ${varWhite256}, ${assignVariantColor}, ${optColorWhite}, NULL, NULL, NULL),
      (${crypto.randomUUID()}, 'variant', ${varWhite256}, ${assignVariantStorage}, ${optStorage256}, NULL, NULL, NULL)
  `);

  // Variant prices — demonstrate per-currency inheritance:
  //   varBlack128 overrides both RON + EUR (own rows).
  //   varWhite256 overrides RON only; EUR inherits the product's 4800.
  await db.run(sql`
    INSERT INTO product_prices (id, product_id, variant_id, currency, price_net) VALUES
      (${crypto.randomUUID()}, NULL, ${varBlack128}, 'RON', 25000),
      (${crypto.randomUUID()}, NULL, ${varBlack128}, 'EUR', 5000),
      (${crypto.randomUUID()}, NULL, ${varWhite256}, 'RON', 30000)
  `);

  console.log('[Plugin:pelerin_ro_shop] Seeded products, attributes, and variants.');

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

  // ─── Product images (sample, dev predictability) ───
  // url holds a storage KEY (resolved to a URL at the accessor layer via
  // sdk.storage.getUrl under the running CMS). See design D2.
  const sampleImgTs = Date.now();
  await db.run(sql`
    INSERT INTO product_images (id, product_id, variant_id, url, alt, sort_order, mime, size, width, height, original_filename)
    VALUES
      (${crypto.randomUUID()}, ${prodSimple}, NULL, ${'products/' + prodSimple + '/' + sampleImgTs + '-sample.png'}, 'Sample', 0, 'image/png', 0, NULL, NULL, 'sample.png')
  `);

  console.log('[Plugin:pelerin_ro_shop] Seeded vouchers and referral codes.');
}
