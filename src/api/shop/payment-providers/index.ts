/**
 * Payment providers listing endpoint — DB-driven, no in-memory registry.
 *
 * GET /api/plugins/shop/payment-providers
 * Returns the set of currently-enabled payment methods, derived from
 * shop_settings via listEnabledPaymentProviders(db).
 *
 * This is the future-proof alternative to iterating the in-memory provider
 * registry: adding a new provider means one line in the accessor, and the
 * endpoint never changes.
 *
 * Public endpoint — no auth required.
 */
import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import type { HandlerDeps } from '../../../lib/handler-types';
import { listEnabledPaymentProviders } from '../../../lib/data/settings';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const names = await listEnabledPaymentProviders(db);
    const providers = names.map((name) => ({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
    }));

    return new Response(JSON.stringify({ success: true, data: { providers } }), {
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
