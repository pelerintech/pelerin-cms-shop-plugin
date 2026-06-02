import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, vouchers, sql as dbSql } from 'astro:db';
import { CreateVoucherSchema } from '../../../schemas/voucher.schema'

/**
 * Derive voucher status from its fields
 */
function deriveStatus(v: any): string {
  if (!v.active) return 'inactive';
  const now = new Date();
  if (v.valid_until && new Date(v.valid_until) < now) return 'expired';
  if (v.max_uses !== null && v.uses_count >= v.max_uses) return 'exhausted';
  return 'active';
}

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const url = new URL(context.request.url);
    const activeFilter = url.searchParams.get('active');
    const typeFilter = url.searchParams.get('type');
    const expiredFilter = url.searchParams.get('expired');
    const search = url.searchParams.get('search');

    // Build conditions
    const conditions: any[] = [];
    const now = new Date();

    if (activeFilter !== null) {
      const isActive = activeFilter === 'true';
      if (isActive) {
        conditions.push(dbSql`${vouchers.active} = 1`);
        conditions.push(dbSql`(${vouchers.valid_until} IS NULL OR ${vouchers.valid_until} >= ${now.toISOString()})`);
        conditions.push(dbSql`(${vouchers.max_uses} IS NULL OR ${vouchers.uses_count} < ${vouchers.max_uses})`);
      } else {
        conditions.push(dbSql`(
          ${vouchers.active} = 0
          OR (${vouchers.valid_until} IS NOT NULL AND ${vouchers.valid_until} < ${now.toISOString()})
          OR (${vouchers.max_uses} IS NOT NULL AND ${vouchers.uses_count} >= ${vouchers.max_uses})
        )`);
      }
    }

    if (typeFilter) {
      conditions.push(dbSql`${vouchers.type} = ${typeFilter}`);
    }

    if (expiredFilter === 'true') {
      conditions.push(dbSql`${vouchers.valid_until} IS NOT NULL AND ${vouchers.valid_until} < ${now.toISOString()}`);
    }

    if (search) {
      conditions.push(dbSql`${vouchers.code} LIKE ${'%' + search + '%'}`);
    }

    // Execute query
    let result;
    if (conditions.length > 0) {
      const whereClause = dbSql.join(conditions, ' AND ');
      result = await db.run(dbSql`SELECT * FROM ${vouchers} WHERE ${whereClause} ORDER BY ${vouchers.code} ASC`);
    } else {
      result = await db.run(dbSql`SELECT * FROM ${vouchers} ORDER BY ${vouchers.code} ASC`);
    }

    const list = (result.rows as any[]).map(v => ({
      ...v,
      status: deriveStatus(v),
      remaining_uses: v.max_uses !== null ? v.max_uses - v.uses_count : null,
    }));

    return new Response(
      JSON.stringify({ success: true, data: list }),
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
    const result = CreateVoucherSchema.safeParse(body);

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

    const { code, type, value, min_order_value, max_uses, uses_count, valid_from, valid_until, single_use_per_customer, active } = result.data;

    // Check for duplicate code (case-insensitive)
    const normalizedCode = code.trim().toUpperCase();
    const existing = await db.run(
      dbSql`SELECT id FROM ${vouchers} WHERE UPPER(${vouchers.code}) = ${normalizedCode} LIMIT 1`
    );

    if (existing.rows.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Voucher code already exists' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(vouchers).values({
      id,
      code: code.trim().toUpperCase(),
      type,
      value,
      min_order_value,
      max_uses,
      uses_count,
      valid_from: valid_from ? new Date(valid_from) : null,
      valid_until: valid_until ? new Date(valid_until) : null,
      single_use_per_customer,
      active,
      created_at: new Date(now),
      updated_at: new Date(now),
    });

    const [created] = (await db.run(
      dbSql`SELECT * FROM ${vouchers} WHERE ${vouchers.id} = ${id}`
    )).rows as any[];

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...created,
          status: deriveStatus(created),
          remaining_uses: created.max_uses !== null ? created.max_uses - created.uses_count : null,
        },
      }),
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
