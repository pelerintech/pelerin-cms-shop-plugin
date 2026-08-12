/**
 * Shared discount-evaluation module.
 *
 * Single source of truth for voucher + referral validity and discount math.
 * Used by both GET /cart and checkout so display and charge can never diverge.
 *
 * Voucher status precedence (mirrors the apply endpoint's check order):
 *   1. missing / inactive        → 'inactive'
 *   2. valid_from in the future  → 'inactive'   (defensive; apply rejects this)
 *   3. valid_until passed        → 'expired'
 *   4. max_uses reached          → 'usage_exceeded'
 *   5. subtotal below min order  → 'min_order_not_met'
 *   6. otherwise                 → 'valid'
 *
 * Referral status (referrals have no rule fields — only active + discount):
 *   1. missing / inactive            → 'inactive'
 *   2. a voucher code is applied     → 'superseded_by_voucher' (presence-based,
 *      matching prior GET behavior — voucher always wins)
 *   3. tracking-only (no discount)   → 'valid', discount 0
 *   4. otherwise                     → 'valid'
 *
 * Winning discount: voucher's discount when a voucher is applied and valid;
 * else the referral's discount when applied and valid; else 0. They never
 * combine.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getVoucherByCode } from './data/vouchers.ts';
import { getReferralByCode } from './data/referrals.ts';
import { computeCartTotals } from './cart-totals.ts';
import type { CartItemInput } from './cart-totals.ts';
import type { EnrichedCartItem } from './data/cart.ts';

export type VoucherStatus =
  'valid' | 'min_order_not_met' | 'expired' | 'usage_exceeded' | 'inactive';

export type ReferralStatus = 'valid' | 'inactive' | 'superseded_by_voucher';

export interface VoucherEval {
  code: string;
  type: string | null;
  value: number | null;
  discount_amount: number;
  status: VoucherStatus;
}

export interface ReferralEval {
  code: string;
  discount_type: string | null;
  discount_value: number | null;
  discount_amount: number;
  status: ReferralStatus;
}

export interface CartDiscountEval {
  /** The single winning discount actually charged (voucher, else referral, else 0). */
  discount_amount: number;
  /** Present whenever a voucher code is applied (incl. invalid states). */
  voucher: VoucherEval | null;
  /** Present whenever a referral code is applied (incl. invalid states). */
  referral: ReferralEval | null;
}

export interface AppliedCodes {
  applied_voucher_code: string | null;
  applied_referral_code: string | null;
}

/** Subtotal (net) of the given items, in the given currency. */
function subtotalNet(items: EnrichedCartItem[], currency: string): number {
  return computeCartTotals(items as CartItemInput[], currency).subtotal_net;
}

function percentageDiscount(subtotal: number, value: number): number {
  return Math.round(subtotal * ((value ?? 0) / 100) * 100) / 100;
}

function fixedDiscount(value: number, subtotal: number): number {
  return Math.min(value ?? 0, subtotal);
}

/**
 * Evaluate the applied voucher + referral for a cart.
 * Never mutates the cart — read-only computation.
 */
export async function evaluateCartDiscount(
  db: LibSQLDatabase,
  cart: AppliedCodes,
  items: EnrichedCartItem[],
  currency: string
): Promise<CartDiscountEval> {
  const subtotal = subtotalNet(items, currency);
  const now = new Date();

  // ── Voucher ──
  let voucher: VoucherEval | null = null;
  if (cart.applied_voucher_code) {
    const v = await getVoucherByCode(db, cart.applied_voucher_code);
    const status: VoucherStatus =
      !v || !v.active
        ? 'inactive'
        : v.valid_from && now < new Date(v.valid_from)
          ? 'inactive'
          : v.valid_until && now > new Date(v.valid_until)
            ? 'expired'
            : v.max_uses !== null && v.uses_count >= v.max_uses
              ? 'usage_exceeded'
              : v.min_order_value !== null && subtotal < v.min_order_value
                ? 'min_order_not_met'
                : 'valid';

    let discount = 0;
    if (status === 'valid') {
      discount =
        v?.type === 'fixed_amount'
          ? fixedDiscount(v?.value ?? 0, subtotal)
          : v?.type === 'percentage'
            ? percentageDiscount(subtotal, v?.value ?? 0)
            : 0;
    }

    voucher = {
      code: cart.applied_voucher_code,
      type: v?.type ?? null,
      value: v?.value ?? null,
      discount_amount: discount,
      status,
    };
  }

  // ── Referral ──
  let referral: ReferralEval | null = null;
  if (cart.applied_referral_code) {
    const r = await getReferralByCode(db, cart.applied_referral_code);
    const superseded = Boolean(cart.applied_voucher_code);
    const status: ReferralStatus =
      !r || !r.active ? 'inactive' : superseded ? 'superseded_by_voucher' : 'valid';

    let discount = 0;
    const hasDiscount =
      status === 'valid' && r?.discount_type !== null && r?.discount_value !== null;
    if (hasDiscount) {
      discount =
        r?.discount_type === 'fixed_amount'
          ? fixedDiscount(r?.discount_value ?? 0, subtotal)
          : r?.discount_type === 'percentage'
            ? percentageDiscount(subtotal, r?.discount_value ?? 0)
            : 0;
    }

    referral = {
      code: cart.applied_referral_code,
      discount_type: r?.discount_type ?? null,
      discount_value: r?.discount_value ?? null,
      discount_amount: discount,
      status,
    };
  }

  // ── Winning discount ──
  const discount_amount =
    voucher && voucher.status === 'valid'
      ? voucher.discount_amount
      : referral && referral.status === 'valid'
        ? referral.discount_amount
        : 0;

  return { discount_amount, voucher, referral };
}
