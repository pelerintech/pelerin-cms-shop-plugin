import { z } from 'zod';

/**
 * Order status lifecycle:
 * pending → awaiting_payment → paid → processing → shipped → delivered
 * cancelled can happen from: pending, awaiting_payment, paid, processing
 * refund_requested → refunded
 * delivered → partially_refunded (line-item refund) → refunded (when all items refunded)
 * partially_refunded → refund_requested (manual escalation) → refunded
 */
export const OrderStatus = z.enum([
  'pending',
  'awaiting_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refund_requested',
  'partially_refunded',
  'refunded',
]);

export type OrderStatus = z.infer<typeof OrderStatus>;

/** Product types — physical items need shipping, digital items are downloadable */
export const ProductType = z.enum(['physical', 'digital']);
export type ProductType = z.infer<typeof ProductType>;

/** Shipping types — what kind of delivery method applies */
export const ShippingType = z.enum(['physical', 'digital', 'pickup']);
export type ShippingType = z.infer<typeof ShippingType>;

/** Voucher/discount types */
export const VoucherType = z.enum(['fixed_amount', 'percentage', 'free_shipping']);
export type VoucherType = z.infer<typeof VoucherType>;

/** Customer types — determines required fields for orders */
export const CustomerType = z.enum(['individual', 'company']);
export type CustomerType = z.infer<typeof CustomerType>;

/** Option value data types — stored as text, cast on read */
export const OptionValueType = z.enum(['short_text', 'long_text', 'number', 'boolean', 'list']);
export type OptionValueType = z.infer<typeof OptionValueType>;
