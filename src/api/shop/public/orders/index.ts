import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listOrders, getOrderWithItems } from '../../../../lib/data/orders';
import type { HandlerDeps } from '../../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    const user = await sdk.auth.getUser(ctx.request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(ctx.request.url);
    const userId = url.searchParams.get('user_id');
    const email = url.searchParams.get('email');

    if (!userId && !email) {
      return new Response(
        JSON.stringify({ success: false, error: 'user_id or email is required' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (userId && user.id !== userId) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (email && user.email !== email) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await listOrders(db, {
      userId: userId ?? undefined,
      email: email ?? undefined,
    });

    const ordersWithItems = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result.orders.map((o: any) => getOrderWithItems(db, o.id))
    );

    return new Response(
      JSON.stringify({
        success: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: ordersWithItems.map((ow: any) => ({
          order: ow.order,
          items: ow.items,
          statusHistory: ow.statusHistory,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server Error';
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
