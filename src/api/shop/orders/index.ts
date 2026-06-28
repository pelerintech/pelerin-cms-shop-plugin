import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listOrders } from '../../../lib/data/orders';
import { CreateOrderSchema } from '../../../schemas/order.schema';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => { const sdk = createPluginContext(); return runGet({ db: sdk.db, sdk, ctx: context }); }

export const POST: APIRoute = (context) => { const sdk = createPluginContext(); return runPost({ db: sdk.db, sdk, ctx: context }); }

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const url = new URL(ctx.request.url);
    const statusFilter = url.searchParams.get('status');
    const result = await listOrders(db, {
      page: parseInt(url.searchParams.get('page') ?? '1') || 1,
      limit: parseInt(url.searchParams.get('limit') ?? '50') || 50,
      status: statusFilter ? statusFilter.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
      dir: url.searchParams.get('dir')?.toLowerCase() === 'asc' ? 'asc' : 'desc',
    });

    return new Response(JSON.stringify({ success: true, data: result.orders, total: result.total, page: result.page, limit: result.limit }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const body = await ctx.request.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({
        success: false, error: 'Validation failed',
        fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])),
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    // Admin order creation delegates to the checkout flow's createOrder via the accessor.
    // createOrder generates its own order_number (transactional, with UNIQUE retry)
    // and returns the actual number used.
    const { createOrder } = await import('../../../lib/data/orders');
    const order = await createOrder(db, parsed.data);

    return new Response(JSON.stringify({ success: true, data: order }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
