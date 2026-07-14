import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import type { HandlerDeps } from '../../../lib/handler-types';

// Import provider modules to ensure they're registered
import '../../../providers/payment/euplatesc';
import '../../../providers/payment/stripe';
import { listProviders } from '../../../providers/payment/registry';

/**
 * GET /api/plugins/shop/payment-providers
 * Returns a list of configured payment providers.
 * Public endpoint — no auth required.
 */
export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const providers: { name: string; label: string; refundable: boolean }[] = [];

    for (const provider of listProviders()) {
      if (await provider.isConfigured(db)) {
        const label =
          provider.name.charAt(0).toUpperCase() + provider.name.slice(1).replace(/_/g, ' ');
        providers.push({
          name: provider.name,
          label,
          refundable: provider.refundable,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { providers },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Server Error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
