import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, referral_codes, sql as dbSql } from 'astro:db';
import { CreateReferralCodeSchema } from '../../../schemas/referral.schema'

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const url = new URL(context.request.url);
    const activeFilter = url.searchParams.get('active');

    let result;
    if (activeFilter !== null) {
      const isActive = activeFilter === 'true';
      result = await db.run(
        dbSql`SELECT * FROM ${referral_codes} WHERE ${referral_codes.active} = ${isActive ? 1 : 0} ORDER BY ${referral_codes.code} ASC`
      );
    } else {
      result = await db.run(
        dbSql`SELECT * FROM ${referral_codes} ORDER BY ${referral_codes.code} ASC`
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: result.rows }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const body = await context.request.json();
    const result = CreateReferralCodeSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(
            result.error.issues.map(i => [i.path.join('.'), i.message])
          ),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { code, name, discount_type, discount_value, active, notes } = result.data;

    // Check for duplicate code (case-insensitive)
    const normalizedCode = code.trim().toUpperCase();
    const existing = await db.run(
      dbSql`SELECT id FROM ${referral_codes} WHERE UPPER(${referral_codes.code}) = ${normalizedCode} LIMIT 1`
    );

    if (existing.rows.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Referral code already exists' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(referral_codes).values({
      id,
      code: code.trim().toUpperCase(),
      name,
      discount_type,
      discount_value,
      active,
      notes,
      created_at: new Date(now),
      updated_at: new Date(now),
    });

    const [created] = (await db.run(
      dbSql`SELECT * FROM ${referral_codes} WHERE ${referral_codes.id} = ${id}`
    )).rows as any[];

    return new Response(
      JSON.stringify({ success: true, data: created }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
