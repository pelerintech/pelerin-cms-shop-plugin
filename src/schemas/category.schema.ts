import { z } from 'zod';

/**
 * Schema for creating a category
 */
export const CreateCategorySchema = z.object({
  parent_id: z.string().nullable().default(null),
  name: z.string().min(1),
  description: z.string().nullable().default(null),
  slug: z.string().min(1),
  sort_order: z.number().int().default(0),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

/**
 * Schema for updating an existing category — all fields optional
 */
export const UpdateCategorySchema = CreateCategorySchema.partial();

export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;

/**
 * Output schema for a category (includes id, timestamps)
 */
export const CategoryOutputSchema = CreateCategorySchema.extend({
  id: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type CategoryOutput = z.infer<typeof CategoryOutputSchema>;
