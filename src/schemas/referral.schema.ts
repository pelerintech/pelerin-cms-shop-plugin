import { z } from 'zod';
import { VoucherType } from './enums.ts';

/**
 * Schema for creating a referral code
 */
export const CreateReferralCodeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  discount_type: VoucherType.nullable().default(null),
  discount_value: z.number().min(0).nullable().default(null),
  active: z.boolean().default(true),
  notes: z.string().nullable().default(null),
});

export type CreateReferralCodeInput = z.infer<typeof CreateReferralCodeSchema>;

/**
 * Schema for updating a referral code
 */
export const UpdateReferralCodeSchema = CreateReferralCodeSchema.partial();

export type UpdateReferralCodeInput = z.infer<typeof UpdateReferralCodeSchema>;

/**
 * Output schema for a referral code
 */
export const ReferralCodeOutputSchema = CreateReferralCodeSchema.extend({
  id: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type ReferralCodeOutput = z.infer<typeof ReferralCodeOutputSchema>;
