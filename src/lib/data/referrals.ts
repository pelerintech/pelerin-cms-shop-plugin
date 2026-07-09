/**
 * Data accessors for referral codes.
 * Uses eq — never the sql IN-join idiom.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq, desc, and, count, like, or, inArray, notInArray } from 'drizzle-orm';
import { referral_codes, orders } from '../../db/schema.ts';

export interface ReferralRow {
  id: string;
  code: string;
  name: string;
  discount_type: string | null;
  discount_value: number | null;
  active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Find a referral by code (case-insensitive). Returns null if not found. */
export async function getReferralByCode(
  db: LibSQLDatabase,
  code: string,
): Promise<ReferralRow | null> {
  const normalized = code.trim().toUpperCase();
  const all = await db.select().from(referral_codes);
  const ref = all.find(r => r.code.toUpperCase() === normalized);
  return (ref as ReferralRow) ?? null;
}

/** Get a referral by id. */
export async function getReferralById(
  db: LibSQLDatabase,
  id: string,
): Promise<ReferralRow | null> {
  const [ref] = await db.select().from(referral_codes).where(eq(referral_codes.id, id));
  return (ref as ReferralRow) ?? null;
}

/** List all referral codes ordered by created_at DESC. */
export async function listReferrals(db: LibSQLDatabase): Promise<ReferralRow[]>;
export async function listReferrals(
  db: LibSQLDatabase,
  opts: { page?: number; limit?: number; active?: boolean; search?: string },
): Promise<{ rows: ReferralRow[]; total: number; page: number; limit: number }>;
export async function listReferrals(
  db: LibSQLDatabase,
  opts: { page?: number; limit?: number; active?: boolean; search?: string } = {},
): Promise<ReferralRow[] | { rows: ReferralRow[]; total: number; page: number; limit: number }> {
  // r17 Task 9 (list-accessors-sql): push WHERE/ORDER to SQL always; push
  // LIMIT/OFFSET + COUNT(*) when pagination args are present. No-arg array shape
  // preserved for the admin list API endpoint backward compatibility.
  const conditions: any[] = [];
  if (opts.active !== undefined) conditions.push(eq(referral_codes.active, opts.active));
  if (opts.search) {
    const s = `%${opts.search.toLowerCase()}%`;
    conditions.push(or(like(referral_codes.code, s), like(referral_codes.name, s)));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  if (opts.page === undefined && opts.limit === undefined) {
    const rows = await db.select().from(referral_codes).where(where).orderBy(desc(referral_codes.created_at));
    return rows as ReferralRow[];
  }
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const [countRow] = await db.select({ value: count() }).from(referral_codes).where(where);
  const total = countRow?.value ?? 0;
  const paged = await db.select().from(referral_codes)
    .where(where)
    .orderBy(desc(referral_codes.created_at))
    .limit(limit)
    .offset((page - 1) * limit);
  return { rows: paged as ReferralRow[], total, page, limit };
}

export interface CreateReferralInput {
  code: string;
  name: string;
  discount_type?: string | null;
  discount_value?: number | null;
  active: boolean;
  notes?: string | null;
}

/** Create a new referral code. */
export async function createReferral(db: LibSQLDatabase, input: CreateReferralInput): Promise<ReferralRow> {
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(referral_codes).values({
    id, code: input.code, name: input.name, discount_type: input.discount_type ?? null,
    discount_value: input.discount_value ?? null, active: input.active, notes: input.notes ?? null,
    created_at: now, updated_at: now,
  });
  return (await getReferralById(db, id))!;
}

export interface UpdateReferralInput {
  code?: string;
  name?: string;
  discount_type?: string | null;
  discount_value?: number | null;
  active?: boolean;
  notes?: string | null;
}

export class ReferralError extends Error {
  code: 'not_found';
  constructor(message: string) { super(message); this.code = 'not_found'; }
}

/** Update a referral by id. */
export async function updateReferral(db: LibSQLDatabase, id: string, input: UpdateReferralInput): Promise<ReferralRow> {
  const [existing] = await db.select().from(referral_codes).where(eq(referral_codes.id, id));
  if (!existing) throw new ReferralError('Referral not found');
  const updateData: Record<string, any> = { updated_at: new Date() };
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) updateData[k] = v;
  }
  await db.update(referral_codes).set(updateData).where(eq(referral_codes.id, id));
  return (await getReferralById(db, id))!;
}

/** Delete a referral by id. */
export async function deleteReferral(db: LibSQLDatabase, id: string): Promise<void> {
  await db.delete(referral_codes).where(eq(referral_codes.id, id));
}

/** Count completed orders attributed to each referral code.
 * Excludes cancelled and refunded orders. Returns a map of code → count. */
export async function countOrdersByReferralCodes(
  db: LibSQLDatabase,
  codes: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (codes.length === 0) return result;

  const rows = await db
    .select({ referral_code: orders.referral_code, cnt: count() })
    .from(orders)
    .where(
      and(
        inArray(orders.referral_code, codes),
        notInArray(orders.status, ['cancelled', 'refunded'])
      )
    )
    .groupBy(orders.referral_code);

  for (const row of rows) {
    result.set(row.referral_code, Number(row.cnt));
  }
  return result;
}
