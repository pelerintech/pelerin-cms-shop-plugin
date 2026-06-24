/**
 * Data accessors for vouchers.
 * Uses eq — never the sql IN-join idiom.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { vouchers } from '../../db/schema.ts';

export interface VoucherRow {
  id: string;
  code: string;
  type: string;
  value: number | null;
  min_order_value: number | null;
  max_uses: number | null;
  uses_count: number;
  valid_from: Date | null;
  valid_until: Date | null;
  single_use_per_customer: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Find a voucher by code (case-insensitive). Returns null if not found. */
export async function getVoucherByCode(
  db: LibSQLDatabase,
  code: string,
): Promise<VoucherRow | null> {
  const normalized = code.trim().toUpperCase();
  const all = await db.select().from(vouchers);
  const voucher = all.find(v => v.code.toUpperCase() === normalized);
  return (voucher as VoucherRow) ?? null;
}

/** Get a voucher by id. */
export async function getVoucherById(
  db: LibSQLDatabase,
  id: string,
): Promise<VoucherRow | null> {
  const [voucher] = await db.select().from(vouchers).where(eq(vouchers.id, id));
  return (voucher as VoucherRow) ?? null;
}

/** List all vouchers ordered by created_at DESC. */
export async function listVouchers(db: LibSQLDatabase): Promise<VoucherRow[]> {
  const rows = await db.select().from(vouchers);
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return rows as VoucherRow[];
}

export interface CreateVoucherInput {
  code: string;
  type: string;
  value?: number | null;
  min_order_value?: number | null;
  max_uses?: number | null;
  valid_from?: Date | null;
  valid_until?: Date | null;
  single_use_per_customer: boolean;
  active: boolean;
}

/** Create a new voucher. */
export async function createVoucher(db: LibSQLDatabase, input: CreateVoucherInput): Promise<VoucherRow> {
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(vouchers).values({
    id, code: input.code, type: input.type, value: input.value ?? null,
    min_order_value: input.min_order_value ?? null, max_uses: input.max_uses ?? null,
    uses_count: 0, valid_from: input.valid_from ?? null, valid_until: input.valid_until ?? null,
    single_use_per_customer: input.single_use_per_customer, active: input.active,
    created_at: now, updated_at: now,
  });
  return (await getVoucherById(db, id))!;
}

export interface UpdateVoucherInput {
  code?: string;
  type?: string;
  value?: number | null;
  min_order_value?: number | null;
  max_uses?: number | null;
  uses_count?: number;
  valid_from?: Date | null;
  valid_until?: Date | null;
  single_use_per_customer?: boolean;
  active?: boolean;
}

export class VoucherError extends Error {
  code: 'not_found';
  constructor(message: string) { super(message); this.code = 'not_found'; }
}

/** Update a voucher by id. */
export async function updateVoucher(db: LibSQLDatabase, id: string, input: UpdateVoucherInput): Promise<VoucherRow> {
  const [existing] = await db.select().from(vouchers).where(eq(vouchers.id, id));
  if (!existing) throw new VoucherError('Voucher not found');
  const updateData: Record<string, any> = { updated_at: new Date() };
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) updateData[k] = v;
  }
  await db.update(vouchers).set(updateData).where(eq(vouchers.id, id));
  return (await getVoucherById(db, id))!;
}

/** Delete a voucher by id. */
export async function deleteVoucher(db: LibSQLDatabase, id: string): Promise<void> {
  await db.delete(vouchers).where(eq(vouchers.id, id));
}

/** Increment a voucher's usage count. */
export async function incrementVoucherUsage(db: LibSQLDatabase, id: string): Promise<void> {
  const [v] = await db.select().from(vouchers).where(eq(vouchers.id, id));
  if (v) {
    await db.update(vouchers).set({ uses_count: v.uses_count + 1, updated_at: new Date() }).where(eq(vouchers.id, id));
  }
}