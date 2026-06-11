import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, referral_codes, orders, sql as dbSql } from 'astro:db';
import { UpdateReferralCodeSchema } from '../../../schemas/referral.schema'

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const [code] = (await db.run(
      dbSql`SELECT * FROM ${referral_codes} WHERE ${referral_codes.id} = ${id}`
    )).rows as any[];

    if (!code) {
      return new Response(JSON.stringify({ success: false, error: 'Referral code not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Compute attributed order stats — exclude cancelled and refunded orders
    const statsResult = await db.run(
      dbSql`SELECT COUNT(*) as total_orders, COALESCE(SUM(${orders.total}), 0) as total_revenue FROM ${orders} WHERE ${orders.referral_code} = ${code.code} AND ${orders.status} NOT IN ('cancelled', 'refunded')`
    );
    const statsRow = statsResult.rows[0] as any;

    // Fetch currency from orders for this referral code (default to RON)
    const currencyResult = await db.run(
      dbSql`SELECT ${orders.currency} FROM ${orders} WHERE ${orders.referral_code} = ${code.code} AND ${orders.status} NOT IN ('cancelled', 'refunded') LIMIT 1`
    );
    const currency = currencyResult.rows.length > 0 ? (currencyResult.rows[0] as any).currency : 'RON';

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...code,
          stats: {
            total_orders: Number(statsRow.total_orders),
            total_revenue: Number(statsRow.total_revenue),
            currency,
          },
        },
      }),
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

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const [existing] = (await db.run(
      dbSql`SELECT * FROM ${referral_codes} WHERE ${referral_codes.id} = ${id}`
    )).rows as any[];

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Referral code not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const result = UpdateReferralCodeSchema.safeParse(body);

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

    const now = new Date().toISOString();
    const updateData: Record<string, any> = { updated_at: new Date(now) };
    const data = result.data;

    if (data.code !== undefined) updateData.code = data.code.trim().toUpperCase();
    if (data.name !== undefined) updateData.name = data.name;
    if (data.discount_type !== undefined) updateData.discount_type = data.discount_type;
    if (data.discount_value !== undefined) updateData.discount_value = data.discount_value;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.notes !== undefined) updateData.notes = data.notes;

    await db.update(referral_codes).set(updateData).where(eq(referral_codes.id, id));

    const [updated] = (await db.run(
      dbSql`SELECT * FROM ${referral_codes} WHERE ${referral_codes.id} = ${id}`
    )).rows as any[];

    return new Response(
      JSON.stringify({ success: true, data: updated }),
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

export const DELETE: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const [existing] = (await db.run(
      dbSql`SELECT * FROM ${referral_codes} WHERE ${referral_codes.id} = ${id}`
    )).rows as any[];

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Referral code not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Soft-delete: set active to false
    const now = new Date().toISOString();
    await db.update(referral_codes).set({ active: false, updated_at: new Date(now) }).where(eq(referral_codes.id, id));

    return new Response(
      JSON.stringify({ success: true, data: null }),
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