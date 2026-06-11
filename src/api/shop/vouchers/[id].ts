import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, vouchers, sql as dbSql } from 'astro:db';
import { UpdateVoucherSchema } from '../../../schemas/voucher.schema'

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
    const { id } = context.params;

    const [voucher] = (await db.run(
      dbSql`SELECT * FROM ${vouchers} WHERE ${vouchers.id} = ${id}`
    )).rows as any[];

    if (!voucher) {
      return new Response(JSON.stringify({ success: false, error: 'Voucher not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...voucher,
          status: deriveStatus(voucher),
          remaining_uses: voucher.max_uses !== null ? voucher.max_uses - voucher.uses_count : null,
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
      dbSql`SELECT * FROM ${vouchers} WHERE ${vouchers.id} = ${id}`
    )).rows as any[];

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Voucher not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const result = UpdateVoucherSchema.safeParse(body);

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

    // Build update object from provided fields
    const updateData: Record<string, any> = { updated_at: new Date(now) };
    const data = result.data;

    if (data.code !== undefined) updateData.code = data.code.trim().toUpperCase();
    if (data.type !== undefined) updateData.type = data.type;
    if (data.value !== undefined) updateData.value = data.value;
    if (data.min_order_value !== undefined) updateData.min_order_value = data.min_order_value;
    if (data.max_uses !== undefined) updateData.max_uses = data.max_uses;
    if (data.uses_count !== undefined) updateData.uses_count = data.uses_count;
    if (data.valid_from !== undefined) updateData.valid_from = data.valid_from ? new Date(data.valid_from) : null;
    if (data.valid_until !== undefined) updateData.valid_until = data.valid_until ? new Date(data.valid_until) : null;
    if (data.single_use_per_customer !== undefined) updateData.single_use_per_customer = data.single_use_per_customer;
    if (data.active !== undefined) updateData.active = data.active;

    await db.update(vouchers).set(updateData).where(eq(vouchers.id, id));

    const [updated] = (await db.run(
      dbSql`SELECT * FROM ${vouchers} WHERE ${vouchers.id} = ${id}`
    )).rows as any[];

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...updated,
          status: deriveStatus(updated),
          remaining_uses: updated.max_uses !== null ? updated.max_uses - updated.uses_count : null,
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

export const DELETE: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const [existing] = (await db.run(
      dbSql`SELECT * FROM ${vouchers} WHERE ${vouchers.id} = ${id}`
    )).rows as any[];

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Voucher not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Soft-delete: set active to false, preserve historical data
    const now = new Date().toISOString();
    await db.update(vouchers).set({ active: false, updated_at: new Date(now) }).where(eq(vouchers.id, id));

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
