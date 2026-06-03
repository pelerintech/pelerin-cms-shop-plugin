import { z } from 'zod';
import { OrderStatus, CustomerType, ShippingType } from './enums'

/**
 * Address schema — used for both billing and shipping
 */
export const AddressSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  postal_code: z.string().min(1),
  country: z.string().min(1),
  county: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
});

export type AddressInput = z.infer<typeof AddressSchema>;

/**
 * Order item schema
 */
export const OrderItemSchema = z.object({
  product_id: z.string().nullable().default(null),
  variant_id: z.string().nullable().default(null),
  product_name: z.string().min(1),
  sku: z.string().nullable().default(null),
  quantity: z.number().int().min(1),
  price_net: z.number().min(0),
  vat_rate: z.number().min(0).max(1).nullable().default(null),
  price_gross: z.number().min(0),
  currency: z.string().min(1),
});

export type OrderItemInput = z.infer<typeof OrderItemSchema>;

/**
 * Schema for creating a new order
 */
export const CreateOrderSchema = z
  .object({
    user_id: z.string().nullable().default(null),
    customer_type: CustomerType,
    customer_email: z.string().email(),
    customer_name: z.string().min(1),
    customer_phone: z.string().nullable().default(null),
    status: OrderStatus,
    currency: z.string().min(1),
    subtotal_net: z.number().min(0),
    vat_total: z.number().min(0),
    shipping_cost: z.number().min(0),
    discount_amount: z.number().min(0).default(0),
    total: z.number().min(0),
    shipping_type: ShippingType,
    shipping_method: z.string().nullable().default(null),
    voucher_code: z.string().nullable().default(null),
    referral_code: z.string().nullable().default(null),
    billing_first_name: z.string().min(1),
    billing_last_name: z.string().min(1),
    billing_address: z.string().min(1),
    billing_address_extra: z.string().nullable().default(null),
    billing_city: z.string().min(1),
    billing_postal_code: z.string().min(1),
    billing_country: z.string().min(1),
    billing_county: z.string().nullable().default(null),
    billing_phone: z.string().nullable().default(null),
    billing_company: z.string().nullable().default(null),
    billing_vat_number: z.string().nullable().default(null),
    shipping_first_name: z.string().nullable().default(null),
    shipping_last_name: z.string().nullable().default(null),
    shipping_address: z.string().nullable().default(null),
    shipping_address_extra: z.string().nullable().default(null),
    shipping_city: z.string().nullable().default(null),
    shipping_postal_code: z.string().nullable().default(null),
    shipping_country: z.string().nullable().default(null),
    shipping_county: z.string().nullable().default(null),
    shipping_phone: z.string().nullable().default(null),
    shipping_company: z.string().nullable().default(null),
    shipping_vat_number: z.string().nullable().default(null),
    shipping_same_as_billing: z.boolean().default(false),
    payment_provider: z.string().nullable().default(null),
    payment_intent_id: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
    items: z.array(OrderItemSchema).min(1),
  })
  .superRefine((data, ctx) => {
    if (data.customer_type === 'company') {
      if (!data.billing_company || data.billing_company.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'billing_company is required for company customers',
          path: ['billing_company'],
        });
      }
      if (!data.billing_vat_number || data.billing_vat_number.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'billing_vat_number is required for company customers',
          path: ['billing_vat_number'],
        });
      }
    }
    if (!data.shipping_same_as_billing) {
      if (!data.shipping_first_name || data.shipping_first_name.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_first_name is required when shipping differs from billing',
          path: ['shipping_first_name'],
        });
      }
      if (!data.shipping_last_name || data.shipping_last_name.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_last_name is required when shipping differs from billing',
          path: ['shipping_last_name'],
        });
      }
      if (!data.shipping_address || data.shipping_address.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_address is required when shipping differs from billing',
          path: ['shipping_address'],
        });
      }
      if (!data.shipping_city || data.shipping_city.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_city is required when shipping differs from billing',
          path: ['shipping_city'],
        });
      }
      if (!data.shipping_postal_code || data.shipping_postal_code.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_postal_code is required when shipping differs from billing',
          path: ['shipping_postal_code'],
        });
      }
      if (!data.shipping_country || data.shipping_country.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'shipping_country is required when shipping differs from billing',
          path: ['shipping_country'],
        });
      }
    }
  });

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

/**
 * Schema for updating order status
 */
export const UpdateOrderStatusSchema = z.object({
  status: OrderStatus,
  note: z.string().nullable().default(null),
});

export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

/**
 * Schema for order status history entry
 */
export const OrderStatusHistorySchema = z.object({
  order_id: z.string().min(1),
  from_status: OrderStatus.nullable(),
  to_status: OrderStatus,
  note: z.string().nullable().default(null),
  changed_by: z.string().nullable().default(null),
});

export type OrderStatusHistoryInput = z.infer<typeof OrderStatusHistorySchema>;

/**
 * Schema for refund
 */
export const RefundOrderSchema = z.object({
  refund_amount: z.number().min(0),
  refund_notes: z.string().nullable().default(null),
});

export type RefundOrderInput = z.infer<typeof RefundOrderSchema>;

/**
 * Output schema for an order (mirrors CreateOrderSchema + id, timestamps)
 */
export const OrderOutputSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  customer_type: CustomerType,
  customer_email: z.string().email(),
  customer_name: z.string().min(1),
  customer_phone: z.string().nullable(),
  status: OrderStatus,
  currency: z.string().min(1),
  subtotal_net: z.number().min(0),
  vat_total: z.number().min(0),
  shipping_cost: z.number().min(0),
  discount_amount: z.number().min(0),
  total: z.number().min(0),
  shipping_type: ShippingType,
  shipping_method: z.string().nullable(),
  voucher_code: z.string().nullable(),
  referral_code: z.string().nullable(),
  billing_first_name: z.string().min(1),
  billing_last_name: z.string().min(1),
  billing_address: z.string().min(1),
  billing_address_extra: z.string().nullable(),
  billing_city: z.string().min(1),
  billing_postal_code: z.string().min(1),
  billing_country: z.string().min(1),
  billing_county: z.string().nullable(),
  billing_phone: z.string().nullable(),
  billing_company: z.string().nullable(),
  billing_vat_number: z.string().nullable(),
  shipping_first_name: z.string().nullable(),
  shipping_last_name: z.string().nullable(),
  shipping_address: z.string().nullable(),
  shipping_address_extra: z.string().nullable(),
  shipping_city: z.string().nullable(),
  shipping_postal_code: z.string().nullable(),
  shipping_country: z.string().nullable(),
  shipping_county: z.string().nullable(),
  shipping_phone: z.string().nullable(),
  shipping_company: z.string().nullable(),
  shipping_vat_number: z.string().nullable(),
  shipping_same_as_billing: z.boolean(),
  payment_provider: z.string().nullable(),
  payment_intent_id: z.string().nullable(),
  transaction_id: z.string().nullable(),
  refund_amount: z.number().nullable(),
  refund_notes: z.string().nullable(),
  refunded_at: z.date().nullable().optional(),
  notes: z.string().nullable(),
  items: z.array(OrderItemSchema).min(1),
  order_number: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type OrderOutput = z.infer<typeof OrderOutputSchema>;
