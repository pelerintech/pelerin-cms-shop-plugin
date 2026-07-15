import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { parseCSV } from '../../../lib/csv-parser';
import { importPrices } from '../../../lib/import-prices';
import type { HandlerDeps } from '../../../lib/handler-types';

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

/**
 * POST /api/plugins/shop/import/prices
 *
 * Accepts multipart/form-data with a `file` field (a .csv). Parses the CSV,
 * runs the price upsert import, and returns the import result. Invalid rows
 * are reported per-row in `data.errors` (the request itself succeeds with 200).
 */
export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const formData = await ctx.request.formData();
    const file = formData.get('file');

    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv')) {
      return new Response(JSON.stringify({ success: false, error: 'Please upload a CSV file' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const text = await file.text();
    const rows = parseCSV(text);
    const result = await importPrices(db, rows);

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
