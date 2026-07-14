import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { getSetting } from '../../../../../lib/data/settings';
import { decryptIfNeeded } from '../../../../../lib/crypto';
import { computeEuplatescHash, buildRequestFields } from '../../../../../lib/euplatesc-mac';
import type { HandlerDeps } from '../../../../../lib/handler-types';

const EUPLATESC_ENDPOINT = 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php';

export const POST: APIRoute = (context) => { const sdk = createPluginContext(); return runPost({ db: sdk.db, sdk, ctx: context }); }

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const merchantIdRaw = await getSetting(db, 'euplatesc_merchant_id');
  const secretKeyRaw = await getSetting(db, 'euplatesc_secret_key');

  if (!merchantIdRaw || !secretKeyRaw) {
    return new Response(JSON.stringify({
      success: false, error: 'euPlatesc credentials not configured. Set Merchant ID and Merchant Key first.',
    }), { status: 422, headers: { 'Content-Type': 'application/json' } });
  }

  const merchantId = decryptIfNeeded(merchantIdRaw);
  const secretKey = decryptIfNeeded(secretKeyRaw);

  // Derive URLs from request origin
  const origin = new URL(ctx.request.url).origin;
  const webhookUrl = `${origin}/api/plugins/shop/webhooks/euplatesc`;
  const settingsPageUrl = `${origin}/admin/plugins/shop/settings/payments/euplatesc`;

  const now = new Date();
  const timestamp = now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0');
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const invoiceId = `TEST-${timestamp}`;

  const amount = '1.00';
  const curr = 'RON';
  const orderDesc = 'Test payment';
  const merchId = merchantId;

  // Compute MAC
  const fields = buildRequestFields({ amount, curr, invoice_id: invoiceId, order_desc: orderDesc, merch_id: merchId, timestamp, nonce });
  const fpHash = computeEuplatescHash(fields, secretKey).toUpperCase();

  // Build redirect URL
  const params = new URLSearchParams({
    amount,
    curr,
    invoice_id: invoiceId,
    order_desc: orderDesc,
    merch_id: merchId,
    timestamp,
    nonce,
    fp_hash: fpHash,
    'ExtraData[silenturl]': webhookUrl,
    'ExtraData[successurl]': settingsPageUrl,
    'ExtraData[failedurl]': settingsPageUrl,
    'ExtraData[backtosite]': settingsPageUrl,
  });

  const redirectUrl = `${EUPLATESC_ENDPOINT}?${params.toString()}`;

  return new Response(JSON.stringify({ success: true, data: { redirect_url: redirectUrl } }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
