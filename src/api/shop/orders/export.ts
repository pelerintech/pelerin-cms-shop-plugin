import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { listOrders } from '../../../lib/data/orders';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) =>
  runGet({ db, sdk: createPluginContext(), ctx: context });

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const url = new URL(ctx.request.url);
    const statusFilter = url.searchParams.get('status');
    const result = await listOrders(db, {
      page: 1, limit: 10000,
      status: statusFilter ? statusFilter.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      sort: 'created_at', dir: 'desc',
    });

    // Build CSV
    const headers_csv = ['order_number', 'status', 'customer_name', 'customer_email', 'total', 'currency', 'created_at'];
    const lines = [headers_csv.join(',')];
    for (const o of result.orders) {
      lines.push([o.order_number, o.status, `"${o.customer_name}"`, o.customer_email, o.total, o.currency, o.created_at?.toISOString()].join(','));
    }

    return new Response(lines.join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="orders.csv"' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
