import { z } from 'zod';

/**
 * Schema for shop settings — the structured/known keys.
 * shop_settings table is a key/value store; these are the well-known keys.
 */
export const ShopSettingsSchema = z.object({
  order_number_prefix: z.string().default('ORD'),
  order_number_year: z.boolean().default(true),
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

/**
 * euPlatesc payment settings (r17 Task 5). All fields are strings (encrypted at
 * the storage boundary for the secret key). `.partial()` so a PUT may update a
 * subset. Validation runs BEFORE encrypt()/upsertSetting() — no non-string ever
 * reaches the crypto layer.
 */
export const EuplatescSettingsSchema = z.object({
  euplatesc_merchant_id: z.string(),
  euplatesc_secret_key: z.string(),
  euplatesc_test_mode: z.boolean().optional(),
}).partial();

export type EuplatescSettingsInput = z.infer<typeof EuplatescSettingsSchema>;

/**
 * Stripe payment settings (r17 Task 5). String fields validated before encrypt().
 */
export const StripeSettingsSchema = z.object({
  stripe_secret_key: z.string(),
  stripe_webhook_secret: z.string(),
  stripe_publishable_key: z.string().optional(),
}).partial();

export type StripeSettingsInput = z.infer<typeof StripeSettingsSchema>;
