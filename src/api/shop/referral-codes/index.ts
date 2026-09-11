import { errorFields } from '../../../lib/errors.ts';
import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listReferrals, createReferral } from '../../../lib/data/referrals';
import { majorToMinor } from '../../../lib/money.ts';
import { CreateReferralCodeSchema } from '../../../schemas/referral.schema';
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
    const referrals = await listReferrals(db);
    return new Response(JSON.stringify({ success: true, data: referrals }), {
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
    const parsed = CreateReferralCodeSchema.safeParse(body);
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
    const ref = await createReferral(db, {
      ...parsed.data,
      // Money units: discount_value is MAJOR when fixed_amount; percentage stays a percent.
      discount_value:
        parsed.data.discount_type === 'fixed_amount' && parsed.data.discount_value != null
          ? majorToMinor(parsed.data.discount_value)
          : parsed.data.discount_value,
    });
    return new Response(JSON.stringify({ success: true, data: ref }), {
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
