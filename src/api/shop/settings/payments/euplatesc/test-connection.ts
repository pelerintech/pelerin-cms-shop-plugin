import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getSetting } from '../../../../../lib/data/settings';
import { decryptIfNeeded } from '../../../../../lib/crypto';
import { computeEuplatescHash, buildCheckMidFields } from '../../../../../lib/euplatesc-mac';
import type { HandlerDeps } from '../../../../../lib/handler-types';

const EUPLATESC_WS_URL = 'https://manager.euplatesc.ro/v3/index.php?action=ws';

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const merchantIdRaw = await getSetting(db, 'euplatesc_merchant_id');
  const secretKeyRaw = await getSetting(db, 'euplatesc_secret_key');

  if (!merchantIdRaw || !secretKeyRaw) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'euPlatesc credentials not configured. Set Merchant ID and Merchant Key first.',
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const merchantId = decryptIfNeeded(merchantIdRaw);
  const secretKey = decryptIfNeeded(secretKeyRaw);

  const now = new Date();
  const timestamp =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0');
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const fields = buildCheckMidFields({ method: 'check_mid', mid: merchantId, timestamp, nonce });
  const fpHash = computeEuplatescHash(fields, secretKey).toUpperCase();

  const body = new URLSearchParams({
    method: 'check_mid',
    mid: merchantId,
    timestamp,
    nonce,
    fp_hash: fpHash,
  });

  try {
    const res = await fetch(EUPLATESC_WS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json();

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Failed to reach euPlatesc: ${err.message}`,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
