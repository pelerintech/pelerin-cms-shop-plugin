import { z } from 'zod';
import { ProductType, OptionValueType } from './enums'

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
 * Schema for creating a product option type
 */
export const CreateOptionTypeSchema = z.object({
  product_id: z.string().min(1),
  label: z.string().min(1),
  value_type: OptionValueType,
  sort_order: z.number().int().default(0),
});

export type CreateOptionTypeInput = z.infer<typeof CreateOptionTypeSchema>;

/**
 * Schema for creating a product option value
 */
export const CreateOptionValueSchema = z.object({
  option_type_id: z.string().min(1),
  value: z.string().min(1),
  label: z.string().min(1),
  sort_order: z.number().int().default(0),
});

export type CreateOptionValueInput = z.infer<typeof CreateOptionValueSchema>;

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
 * Schema for creating a product image
 */
export const CreateProductImageSchema = z.object({
  product_id: z.string().min(1),
  variant_id: z.string().nullable().default(null),
  url: z.string().min(1),
  alt: z.string().nullable().default(null),
  sort_order: z.number().int().default(0),
});

export type CreateProductImageInput = z.infer<typeof CreateProductImageSchema>;

/**
 * Schema for creating a translation
 */
export const CreateTranslationSchema = z.object({
  entity_type: z.enum(['product', 'category', 'option_type', 'option_value']),
  entity_id: z.string().min(1),
  locale: z.string().min(1),
  name: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  slug: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
});

export type CreateTranslationInput = z.infer<typeof CreateTranslationSchema>;

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
