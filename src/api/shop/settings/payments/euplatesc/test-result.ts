import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getSetting } from '../../../../../lib/data/settings';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const GET: APIRoute = (context) => { const sdk = createPluginContext(); return runGet({ db: sdk.db, sdk, ctx: context }); }

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const raw = await getSetting(db, 'euplatesc_test_result');

  if (!raw) {
    return new Response(JSON.stringify({ success: true, data: null }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = JSON.parse(raw);
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ success: true, data: null }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
}
