import { z } from 'zod';

/**
 * Schema for creating a cart
 */
export const CreateCartSchema = z.object({
  session_id: z.string().min(1),
  user_id: z.string().nullable().default(null),
  expires_at: z.string().datetime(),
});

export type CreateCartInput = z.infer<typeof CreateCartSchema>;

/**
 * Schema for creating a cart item (full, includes cart_id)
 */
export const CreateCartItemSchema = z.object({
  cart_id: z.string().min(1),
  product_id: z.string().min(1),
  variant_id: z.string().nullable().default(null),
  quantity: z.number().int().min(1),
});

export type CreateCartItemInput = z.infer<typeof CreateCartItemSchema>;

/**
 * Schema for POST /cart/items request body (cart_id from session, not body)
 */
export const AddCartItemBodySchema = z.object({
  product_id: z.string().min(1),
  variant_id: z.string().nullable().optional(),
  quantity: z.number().int().min(1).default(1),
});

export type AddCartItemBody = z.infer<typeof AddCartItemBodySchema>;

/**
 * Schema for updating cart item quantity (allows 0 to remove)
 */
export const UpdateCartItemBodySchema = z.object({
  quantity: z.number().int().min(0),
});

export type UpdateCartItemBody = z.infer<typeof UpdateCartItemBodySchema>;

/**
 * Schema for applying a voucher code to a cart
 */
export const ApplyCartVoucherSchema = z.object({
  code: z.string().min(1),
});

export type ApplyCartVoucherInput = z.infer<typeof ApplyCartVoucherSchema>;

/**
 * Schema for applying a referral code to a cart
 */
export const ApplyCartReferralSchema = z.object({
  code: z.string().min(1),
});

export type ApplyCartReferralInput = z.infer<typeof ApplyCartReferralSchema>;

/**
 * Output schema for a cart
 */
export const CartOutputSchema = CreateCartSchema.extend({
  id: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type CartOutput = z.infer<typeof CartOutputSchema>;

/**
 * Output schema for a cart item
 */
export const CartItemOutputSchema = CreateCartItemSchema.extend({
  id: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type CartItemOutput = z.infer<typeof CartItemOutputSchema>;
