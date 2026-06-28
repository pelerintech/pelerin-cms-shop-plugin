import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { transitionOrderStatus, getOrderWithItems, OrderTransitionError } from '../../../../lib/data/orders';
import { UpdateOrderStatusSchema } from '../../../../schemas/order.schema';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const PUT: APIRoute = (context) => { const sdk = createPluginContext(); return runPut({ db: sdk.db, sdk, ctx: context }); }

export async function runPut({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const orderId = ctx.params.id!;
    let body: any;
    try { body = await ctx.request.json(); } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsed = UpdateOrderStatusSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({
        success: false, error: 'Validation failed',
        fields: Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])),
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    const { status, note } = parsed.data;
    try {
      await transitionOrderStatus(db, orderId, status, note ?? undefined, 'admin');
    } catch (err: any) {
      if (err instanceof OrderTransitionError) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 409, headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }

    const updated = await getOrderWithItems(db, orderId);
    return new Response(JSON.stringify({ success: true, data: updated!.order }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
