import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import {
  getReferralById,
  updateReferral,
  deleteReferral,
  ReferralError,
} from '../../../lib/data/referrals';
import { UpdateReferralCodeSchema } from '../../../schemas/referral.schema';
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
    const r = await getReferralById(db, ctx.params.id!);
    if (!r)
      return new Response(JSON.stringify({ success: false, error: 'Referral not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    return new Response(JSON.stringify({ success: true, data: r }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: err.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    const body = await ctx.request.json();
    const parsed = UpdateReferralCodeSchema.safeParse(body);
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
    const r = await updateReferral(db, ctx.params.id!, parsed.data);
    return new Response(JSON.stringify({ success: true, data: r }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    if (err instanceof ReferralError)
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: err.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
    await deleteReferral(db, ctx.params.id!);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: err.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
