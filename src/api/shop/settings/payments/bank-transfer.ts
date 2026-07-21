/**
 * Bank transfer settings API endpoint.
 *
 * GET  /api/plugins/shop/settings/payments/bank-transfer  — fetch bank transfer config
 * PUT  /api/plugins/shop/settings/payments/bank-transfer  — save bank transfer config
 *
 * Both endpoints are admin-guarded.
 */
import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getSetting, upsertSetting } from '../../../../lib/data/settings';
import { z } from 'zod';
import type { HandlerDeps } from '../../../../lib/handler-types';

const BankTransferSettingsSchema = z.object({
  beneficiary: z.string().min(1, { message: 'Beneficiary is required' }),
  iban: z.string().min(1, { message: 'IBAN is required' }),
  bank_name: z.string().optional(),
  reference_note: z.string().optional(),
});

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export const PUT: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPut({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        beneficiary: await getSetting(db, 'bank_transfer_beneficiary'),
        iban: await getSetting(db, 'bank_transfer_iban'),
        bank_name: await getSetting(db, 'bank_transfer_bank_name'),
        reference_note: await getSetting(db, 'bank_transfer_reference_note'),
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await ctx.request.json();
    const parsed = BankTransferSettingsSchema.safeParse(body);
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

    const { beneficiary, iban, bank_name, reference_note } = parsed.data;

    await upsertSetting(db, 'bank_transfer_beneficiary', beneficiary);
    await upsertSetting(db, 'bank_transfer_iban', iban);
    if (bank_name) await upsertSetting(db, 'bank_transfer_bank_name', bank_name);
    if (reference_note) await upsertSetting(db, 'bank_transfer_reference_note', reference_note);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
