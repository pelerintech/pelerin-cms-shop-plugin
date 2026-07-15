/**
 * Migration function for changing the default locale.
 *
 * When the admin changes the default locale (e.g., from 'ro' to 'en'), this
 * function swaps data between parent tables and the translations table:
 * - Copy new-default locale data from translations → parent table columns
 * - Move old-default locale data from parent table columns → translations
 *
 * Handles: products, categories, product_attributes, product_attribute_options
 *
 * This is wrapped in a transaction for atomicity (all-or-nothing).
 * Idempotent: running twice doesn't break things.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq, and, sql } from 'drizzle-orm';
import {
  products,
  categories,
  product_attributes,
  product_attribute_options,
  translations,
  shop_settings,
} from '../../db/schema.ts';

export async function migrateDefaultLocale(
  db: LibSQLDatabase,
  oldLocale: string,
  newLocale: string
): Promise<{ products: number; categories: number; attributes: number; options: number }> {
  if (oldLocale === newLocale) {
    return { products: 0, categories: 0, attributes: 0, options: 0 };
  }

  // Transaction wrapper for atomicity
  return db.transaction(async (tx) => {
    const result = { products: 0, categories: 0, attributes: 0, options: 0 };

    // Migrate products
    const allProducts = await tx.select().from(products);
    for (const product of allProducts) {
      // Check if new default translation exists
      const [newDefaultTranslation] = await tx
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product'),
            eq(translations.entity_id, product.id),
            eq(translations.locale, newLocale)
          )
        );

      // Move current parent table data to translations with old locale.
      // Use upsert logic — if a translation for the old locale already exists
      // (e.g. user edited it when it was secondary), update it rather than
      // creating a duplicate row.
      const [existingOldTranslation] = await tx
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product'),
            eq(translations.entity_id, product.id),
            eq(translations.locale, oldLocale)
          )
        );

      // Idempotency guard: if the parent table already matches the new-default
      // translation, the swap was already done — skip this product entirely.
      const alreadyMigrated =
        newDefaultTranslation &&
        product.name === (newDefaultTranslation.name ?? product.name) &&
        product.description === (newDefaultTranslation.description ?? product.description) &&
        product.slug === (newDefaultTranslation.slug ?? product.slug);

      if (!alreadyMigrated) {
        if (existingOldTranslation) {
          await tx
            .update(translations)
            .set({
              name: product.name,
              description: product.description,
              slug: product.slug,
              label: null,
            })
            .where(eq(translations.id, existingOldTranslation.id));
        } else {
          await tx.insert(translations).values({
            id: crypto.randomUUID(),
            entity_type: 'product',
            entity_id: product.id,
            locale: oldLocale,
            name: product.name,
            description: product.description,
            slug: product.slug,
            label: null,
          });
        }
      }

      // If new default translation exists, copy it to parent table
      if (newDefaultTranslation) {
        await tx
          .update(products)
          .set({
            name: newDefaultTranslation.name ?? product.name,
            description: newDefaultTranslation.description ?? product.description,
            slug: newDefaultTranslation.slug ?? product.slug,
          })
          .where(eq(products.id, product.id));
        result.products++;
      }
    }

    // Migrate categories
    const allCategories = await tx.select().from(categories);
    for (const category of allCategories) {
      const [newDefaultTranslation] = await tx
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'category'),
            eq(translations.entity_id, category.id),
            eq(translations.locale, newLocale)
          )
        );

      const [existingOldCatTranslation] = await tx
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'category'),
            eq(translations.entity_id, category.id),
            eq(translations.locale, oldLocale)
          )
        );

      const alreadyMigratedCat =
        newDefaultTranslation &&
        category.name === (newDefaultTranslation.name ?? category.name) &&
        category.description === (newDefaultTranslation.description ?? category.description) &&
        category.slug === (newDefaultTranslation.slug ?? category.slug);

      if (!alreadyMigratedCat) {
        if (existingOldCatTranslation) {
          await tx
            .update(translations)
            .set({
              name: category.name,
              description: category.description,
              slug: category.slug,
              label: null,
            })
            .where(eq(translations.id, existingOldCatTranslation.id));
        } else {
          await tx.insert(translations).values({
            id: crypto.randomUUID(),
            entity_type: 'category',
            entity_id: category.id,
            locale: oldLocale,
            name: category.name,
            description: category.description,
            slug: category.slug,
            label: null,
          });
        }
      }

      if (newDefaultTranslation) {
        await tx
          .update(categories)
          .set({
            name: newDefaultTranslation.name ?? category.name,
            description: newDefaultTranslation.description ?? category.description,
            slug: newDefaultTranslation.slug ?? category.slug,
          })
          .where(eq(categories.id, category.id));
        result.categories++;
      }
    }

    // Migrate product attributes
    const allAttributes = await tx.select().from(product_attributes);
    for (const attribute of allAttributes) {
      const [newDefaultTranslation] = await tx
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product_attribute'),
            eq(translations.entity_id, attribute.id),
            eq(translations.locale, newLocale)
          )
        );

      const [existingOldAttrTranslation] = await tx
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product_attribute'),
            eq(translations.entity_id, attribute.id),
            eq(translations.locale, oldLocale)
          )
        );

      const alreadyMigratedAttr =
        newDefaultTranslation && attribute.name === (newDefaultTranslation.name ?? attribute.name);

      if (!alreadyMigratedAttr) {
        if (existingOldAttrTranslation) {
          await tx
            .update(translations)
            .set({
              name: attribute.name,
              description: null,
              slug: null,
              label: null,
            })
            .where(eq(translations.id, existingOldAttrTranslation.id));
        } else {
          await tx.insert(translations).values({
            id: crypto.randomUUID(),
            entity_type: 'product_attribute',
            entity_id: attribute.id,
            locale: oldLocale,
            name: attribute.name,
            description: null,
            slug: null,
            label: null,
          });
        }
      }

      if (newDefaultTranslation) {
        await tx
          .update(product_attributes)
          .set({
            name: newDefaultTranslation.name ?? attribute.name,
          })
          .where(eq(product_attributes.id, attribute.id));
        result.attributes++;
      }
    }

    // Migrate product attribute options
    const allOptions = await tx.select().from(product_attribute_options);
    for (const option of allOptions) {
      const [newDefaultTranslation] = await tx
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product_attribute_option'),
            eq(translations.entity_id, option.id),
            eq(translations.locale, newLocale)
          )
        );

      // Use upsert logic — if a translation for the old locale already exists,
      // skip (idempotent). Options store only label in translations and all
      // values are null for the old-locale entry.
      const [existingOldOptionTranslation] = await tx
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product_attribute_option'),
            eq(translations.entity_id, option.id),
            eq(translations.locale, oldLocale)
          )
        );
      if (!existingOldOptionTranslation) {
        await tx.insert(translations).values({
          id: crypto.randomUUID(),
          entity_type: 'product_attribute_option',
          entity_id: option.id,
          locale: oldLocale,
          name: null,
          description: null,
          slug: null,
          label: null,
        });
      }

      if (newDefaultTranslation?.label) {
        // Update the option's value in the parent table? No, options don't have a label column.
        // The label is only in translations. So we just ensure the new default translation exists.
        // Actually, for options, the `value` column in product_attribute_options is the code,
        // and the display label is in translations. So we don't need to update the parent table.
        result.options++;
      }
    }

    // Delete old default_locale key from shop_settings (if it exists)
    await tx.delete(shop_settings).where(eq(shop_settings.key, 'default_locale'));

    return result;
  });
}
