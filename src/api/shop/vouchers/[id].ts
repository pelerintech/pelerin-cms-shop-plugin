import { errorFields } from '../../../lib/errors.ts';
import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  getVoucherById,
  updateVoucher,
  deleteVoucher,
  VoucherError,
} from '../../../lib/data/vouchers';
import { majorToMinor } from '../../../lib/money.ts';
import { UpdateVoucherSchema } from '../../../schemas/voucher.schema';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export const PUT: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPut({ db: sdk.db, sdk, ctx: context });
};

export const DELETE: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runDelete({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const v = await getVoucherById(db, ctx.params.id!);
    if (!v)
      return new Response(JSON.stringify({ success: false, error: 'Voucher not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    return new Response(JSON.stringify({ success: true, data: v }), {
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

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    const parsed = UpdateVoucherSchema.safeParse(body);
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
    const v = await updateVoucher(db, ctx.params.id!, {
      ...parsed.data,
      // Convert money fields (major input → minor store). type may be absent on update,
      // so only convert value when the resolved type is fixed_amount (percentage stays).
      value:
        parsed.data.value != null && parsed.data.type === 'fixed_amount'
          ? majorToMinor(parsed.data.value)
          : parsed.data.value,
      min_order_value:
        parsed.data.min_order_value != null
          ? majorToMinor(parsed.data.min_order_value)
          : parsed.data.min_order_value,
      valid_from: parsed.data.valid_from ? new Date(parsed.data.valid_from) : null,
      valid_until: parsed.data.valid_until ? new Date(parsed.data.valid_until) : null,
    });
    return new Response(JSON.stringify({ success: true, data: v }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    if (err instanceof VoucherError)
      return new Response(JSON.stringify({ success: false, error: errorFields(err).message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status: errorFields(err).status ?? 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    await deleteVoucher(db, ctx.params.id!);
    return new Response(JSON.stringify({ success: true }), {
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
