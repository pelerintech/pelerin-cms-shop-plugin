import { z } from 'zod';
import { VoucherType } from './enums.ts';

const VoucherBaseSchema = z.object({
  code: z.string().min(1),
  type: VoucherType,
  value: z.number().min(0).nullable().default(null),
  min_order_value: z.number().min(0).nullable().default(null),
  max_uses: z.number().int().min(1).nullable().default(null),
  uses_count: z.number().int().min(0).default(0),
  valid_from: z.string().datetime().nullable().default(null),
  valid_until: z.string().datetime().nullable().default(null),
  single_use_per_customer: z.boolean().default(false),
  active: z.boolean().default(true),
});

/**
 * Schema for creating a new voucher
 */
export const CreateVoucherSchema = VoucherBaseSchema.superRefine((data, ctx) => {
  if (data.type === 'fixed_amount' || data.type === 'percentage') {
    if (data.value === null || data.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `value is required for ${data.type} vouchers`,
        path: ['value'],
      });
    }
  }
  if (data.valid_from && data.valid_until) {
    const from = new Date(data.valid_from);
    const until = new Date(data.valid_until);
    if (until <= from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'valid_until must be after valid_from',
        path: ['valid_until'],
      });
    }
  }
});

export type CreateVoucherInput = z.infer<typeof CreateVoucherSchema>;

/**
 * Schema for updating an existing voucher — all fields optional
 */
export const UpdateVoucherSchema = VoucherBaseSchema.partial();

export type UpdateVoucherInput = z.infer<typeof UpdateVoucherSchema>;

/**
 * Schema for applying a voucher to an order
 */
export const ApplyVoucherSchema = z.object({
  code: z.string().min(1),
  order_total: z.number().min(0),
  currency: z.string().min(1),
});

export type ApplyVoucherInput = z.infer<typeof ApplyVoucherSchema>;

/**
 * Output schema for a voucher
 */
export const VoucherOutputSchema = z.object({
  id: z.string(),
  code: z.string().min(1),
  type: VoucherType,
  value: z.number().min(0).nullable(),
  min_order_value: z.number().min(0).nullable(),
  max_uses: z.number().int().min(1).nullable(),
  uses_count: z.number().int().min(0),
  valid_from: z.string().datetime().nullable(),
  valid_until: z.string().datetime().nullable(),
  single_use_per_customer: z.boolean(),
  active: z.boolean(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type VoucherOutput = z.infer<typeof VoucherOutputSchema>;
