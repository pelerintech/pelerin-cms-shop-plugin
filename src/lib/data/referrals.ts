/**
 * Data accessors for referral codes.
 * Uses eq — never the sql IN-join idiom.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { referral_codes } from '../../db/schema.ts';

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
export async function listReferrals(db: LibSQLDatabase): Promise<ReferralRow[]> {
  const rows = await db.select().from(referral_codes);
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return rows as ReferralRow[];
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
