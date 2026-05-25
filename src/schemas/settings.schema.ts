import { z } from 'zod';

/**
 * Schema for shop settings — the structured/known keys.
 * shop_settings table is a key/value store; these are the well-known keys.
 */
export const ShopSettingsSchema = z.object({
  order_number_prefix: z.string().default('ORD'),
  order_number_year: z.string().default(''),
  order_number_padding: z.number().int().min(1).default(6),
  order_number_sequence: z.number().int().min(0).default(0),
});

export type ShopSettingsInput = z.infer<typeof ShopSettingsSchema>;

/**
 * Schema for updating shop settings — all fields optional
 */
export const UpdateShopSettingsSchema = ShopSettingsSchema.partial();

export type UpdateShopSettingsInput = z.infer<typeof UpdateShopSettingsSchema>;

/**
 * Output schema for a single shop_settings row (key/value pair as stored in DB)
 */
export const ShopSettingOutputSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  value: z.string(),
});

export type ShopSettingOutput = z.infer<typeof ShopSettingOutputSchema>;
