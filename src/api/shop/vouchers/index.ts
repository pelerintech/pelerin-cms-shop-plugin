import { errorFields } from '../../../lib/errors.ts';
import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listVouchers, createVoucher } from '../../../lib/data/vouchers';
import { majorToMinor } from '../../../lib/money.ts';
import { CreateVoucherSchema } from '../../../schemas/voucher.schema';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const vouchers = await listVouchers(db);
    return new Response(JSON.stringify({ success: true, data: vouchers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status: errorFields(err).status ?? 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    const parsed = CreateVoucherSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const voucher = await createVoucher(db, {
      ...parsed.data,
      // Money units: form input is MAJOR; only fixed_amount value + min_order_value
      // are monetary (percentage stays a percent). Convert to minor on store.
      value:
        parsed.data.type === 'fixed_amount' && parsed.data.value != null
          ? majorToMinor(parsed.data.value)
          : parsed.data.value,
      min_order_value:
        parsed.data.min_order_value != null ? majorToMinor(parsed.data.min_order_value) : null,
      valid_from: parsed.data.valid_from ? new Date(parsed.data.valid_from) : null,
      valid_until: parsed.data.valid_until ? new Date(parsed.data.valid_until) : null,
    });
    return new Response(JSON.stringify({ success: true, data: voucher }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status: errorFields(err).status ?? 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
