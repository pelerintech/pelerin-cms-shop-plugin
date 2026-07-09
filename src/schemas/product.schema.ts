import { z } from 'zod';
import { ProductType, OptionValueType } from './enums.ts'

/**
 * Schema for creating a global product attribute
 */
export const CreateAttributeSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['select', 'text', 'rich_text', 'number', 'boolean']),
  sort_order: z.number().int().default(0),
});

export type CreateAttributeInput = z.infer<typeof CreateAttributeSchema>;

/**
 * Schema for updating a global product attribute — all fields optional
 */
export const UpdateAttributeSchema = CreateAttributeSchema.partial();

export type UpdateAttributeInput = z.infer<typeof UpdateAttributeSchema>;

/**
 * Schema for creating an attribute option (select-type only)
 */
export const CreateAttributeOptionSchema = z.object({
  attribute_id: z.string().min(1),
  value: z.string().min(1),
  sort_order: z.number().int().default(0),
});

export type CreateAttributeOptionInput = z.infer<typeof CreateAttributeOptionSchema>;

/**
 * Schema for updating an attribute option — all fields optional
 */
export const UpdateAttributeOptionSchema = CreateAttributeOptionSchema.partial();

export type UpdateAttributeOptionInput = z.infer<typeof UpdateAttributeOptionSchema>;

/**
 * Schema for assigning an attribute to a product
 */
export const CreateAttributeAssignmentSchema = z.object({
  attribute_id: z.string().min(1),
  role: z.enum(['dimension', 'field']),
  sort_order: z.number().int().default(0),
  offered_option_ids: z.array(z.string().min(1)).default([]),
});

export type CreateAttributeAssignmentInput = z.infer<typeof CreateAttributeAssignmentSchema>;

/**
 * Schema for setting an attribute value on a product or variant
 */
export const CreateAttributeValueSchema = z.object({
  entity_type: z.enum(['product', 'variant']),
  entity_id: z.string().min(1),
  assignment_id: z.string().min(1),
  option_id: z.string().min(1).nullable().default(null),
  value_text: z.string().nullable().default(null),
  value_number: z.number().nullable().default(null),
  value_boolean: z.boolean().nullable().default(null),
});

export type CreateAttributeValueInput = z.infer<typeof CreateAttributeValueSchema>;

/**
 * Schema for updating a variant (PUT)
 */
export const UpdateVariantSchema = z.object({
  sku: z.string().min(1).nullable().default(null),
  stock: z.number().int().min(0).nullable().default(null),
  active: z.boolean().optional(),
});

export type UpdateVariantInput = z.infer<typeof UpdateVariantSchema>;

/**
 * Schema for creating a new product
 */
export const CreateProductSchema = z.object({
  type: ProductType,
  sku: z.string().min(1).nullable().default(null),
  has_variants: z.boolean().default(false),
  vat_rate: z.number().min(0).max(1).nullable().default(null),
  stock: z.number().int().min(0).nullable().default(null),
  category_id: z.string().nullable().default(null),
  active: z.boolean().default(true),
  name: z.string().min(1),
  description: z.string().nullable().default(null),
  slug: z.string().min(1),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

/**
 * Schema for updating an existing product — all fields optional
 */
export const UpdateProductSchema = CreateProductSchema.partial();

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

/**
 * Schema for creating a product variant
 */
export const CreateVariantSchema = z.object({
  product_id: z.string().min(1),
  sku: z.string().min(1).nullable().default(null),
  stock: z.number().int().min(1).nullable().default(null),
  active: z.boolean().default(true),
  option_value_ids: z.array(z.string().min(1)).optional(),
});

export type CreateVariantInput = z.infer<typeof CreateVariantSchema>;

/**
 * Schema for creating a product price
 */
export const CreatePriceSchema = z
  .object({
    product_id: z.string().nullable().default(null),
    variant_id: z.string().nullable().default(null),
    currency: z.string().min(1),
    price_net: z.number().min(0),
  })
  .superRefine((data, ctx) => {
    const hasProduct = data.product_id !== null;
    const hasVariant = data.variant_id !== null;
    if (!hasProduct && !hasVariant) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either product_id or variant_id must be set',
        path: ['product_id'],
      });
    }
    if (hasProduct && hasVariant) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one of product_id or variant_id can be set',
        path: ['product_id'],
      });
    }
  });

export type CreatePriceInput = z.infer<typeof CreatePriceSchema>;

/**
 * Schema for bulk upserting product/variant prices (PUT /prices)
 */
export const BulkUpsertPricesSchema = z.object({
  prices: z.array(CreatePriceSchema).min(1),
});

export type BulkUpsertPricesInput = z.infer<typeof BulkUpsertPricesSchema>;

/**
 * Schema for the multipart-derived product image upload input.
 *
 * The `file` itself is validated by presence (not Zod). `storage_key`/`mime`/
 * `size`/`width`/`height`/`original_filename` come from `sdk.storage.upload()`
 * and the `File` object (NOT user input), so they are absent from this
 * user-facing schema. The `url` column holds a storage KEY resolved to a URL at
 * the accessor layer (design D2).
 */
export const UploadProductImageSchema = z.object({
  product_id: z.string().min(1),
  variant_id: z.string().nullable().default(null),
  alt: z.string().nullable().default(null),
  sort_order: z.number().int().default(0),
});

export type UploadProductImageInput = z.infer<typeof UploadProductImageSchema>;

/**
 * Schema for creating a translation
 */
export const CreateTranslationSchema = z.object({
  entity_type: z.enum(['product', 'category', 'option_type', 'option_value', 'product_attribute', 'product_attribute_option']),
  entity_id: z.string().min(1),
  locale: z.string().min(1),
  name: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  slug: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
});

export type CreateTranslationInput = z.infer<typeof CreateTranslationSchema>;

/**
 * Schema for upserting a PRODUCT translation from the admin UI (r17 Task 6).
 * Contains ONLY the translatable content fields — `entity_type`, `entity_id`,
 * and `locale` come from the route path params and ALWAYS win over any body
 * value (closes the path-param hijack). At least one content field is required
 * (an empty body is a 422, not a no-op empty-translation write).
 */
export const UpsertProductTranslationSchema = z
  .object({
    name: z.string().nullable(),
    description: z.string().nullable(),
    slug: z.string().nullable(),
    label: z.string().nullable(),
  })
  .partial()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one content field (name, description, slug, label) is required',
  });

export type UpsertProductTranslationInput = z.infer<typeof UpsertProductTranslationSchema>;

/**
 * Output schema for a product (includes id, timestamps)
 */
export const ProductOutputSchema = CreateProductSchema.extend({
  id: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type ProductOutput = z.infer<typeof ProductOutputSchema>;

/**
 * Output schema for a variant
 */
export const VariantOutputSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  sku: z.string().nullable(),
  stock: z.number().int().nullable(),
  active: z.boolean(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type VariantOutput = z.infer<typeof VariantOutputSchema>;

/**
 * Output schema for a product image
 */
export const ProductImageOutputSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  variant_id: z.string().nullable(),
  url: z.string(),
  alt: z.string().nullable(),
  sort_order: z.number().int(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type ProductImageOutput = z.infer<typeof ProductImageOutputSchema>;

/**
 * Output schema for a translation
 */
export const TranslationOutputSchema = CreateTranslationSchema.extend({
  id: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type TranslationOutput = z.infer<typeof TranslationOutputSchema>;
