import { errorFields } from '../../../lib/errors.ts';
import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { listOrders } from '../../../lib/data/orders';
import { majorToMinor } from '../../../lib/money.ts';
import { CreateOrderSchema } from '../../../schemas/order.schema';
import { buildOrderEventData } from '../../../lib/event-payload';
import type { HandlerDeps } from '../../../lib/handler-types';

export const GET: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runGet({ db: sdk.db, sdk, ctx: context });
};

export const POST: APIRoute = (context) => {
  const sdk = createPluginContext();
  return runPost({ db: sdk.db, sdk, ctx: context });
};

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const url = new URL(ctx.request.url);
    const statusFilter = url.searchParams.get('status');
    const result = await listOrders(db, {
      page: parseInt(url.searchParams.get('page') ?? '1') || 1,
      limit: parseInt(url.searchParams.get('limit') ?? '50') || 50,
      status: statusFilter
        ? statusFilter
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
      dir: url.searchParams.get('dir')?.toLowerCase() === 'asc' ? 'asc' : 'desc',
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: result.orders,
        total: result.total,
        page: result.page,
        limit: result.limit,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    const status = errorFields(err).status ?? 500;
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const body = await ctx.request.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Admin order creation delegates to the checkout flow's createOrder via the accessor.
    // createOrder generates its own order_number (transactional, with UNIQUE retry)
    // and returns the actual number used. The admin schema allows blank (nullable)
    // shipping fields, but the orders table columns are NOT NULL — coalesce to ''.
    const { createOrder } = await import('../../../lib/data/orders');
    // Admin manual-order input is in MAJOR units (form) → convert to minor on store.
    const subtotalNet = majorToMinor(parsed.data.subtotal_net);
    const vatTotal = majorToMinor(parsed.data.vat_total);
    const shippingCost = majorToMinor(parsed.data.shipping_cost);
    const discountAmount = majorToMinor(parsed.data.discount_amount);
    const order = await createOrder(db, {
      order_number: null,
      ...parsed.data,
      subtotal_net: subtotalNet,
      vat_total: vatTotal,
      shipping_cost: shippingCost,
      discount_amount: discountAmount,
      // Derive the total from the converted fields (checkout convention:
      // subtotal_net + vat_total + shipping_cost − discount_amount), so the stored
      // order is internally consistent regardless of a client-supplied value.
      total: subtotalNet + vatTotal + shippingCost - discountAmount,
      items: parsed.data.items.map((it) => ({
        ...it,
        price_net: majorToMinor(it.price_net),
        price_gross: majorToMinor(it.price_gross),
      })),
      shipping_first_name: parsed.data.shipping_first_name ?? '',
      shipping_last_name: parsed.data.shipping_last_name ?? '',
      shipping_address: parsed.data.shipping_address ?? '',
      shipping_city: parsed.data.shipping_city ?? '',
      shipping_postal_code: parsed.data.shipping_postal_code ?? '',
      shipping_country: parsed.data.shipping_country ?? '',
    });

    // Emit shop.order.confirmed so admin-created orders notify like storefront orders.
    // Fire-and-forget: a publish failure must not reject the create response.
    try {
      const eventData = await buildOrderEventData(db, order.id, 'shop.order.confirmed');
      sdk.events.publish('shop.order.confirmed', eventData);
    } catch (publishErr: unknown) {
      console.error(
        `[shop] Failed to publish shop.order.confirmed for order ${order.id}: ${errorFields(publishErr).message}`
      );
    }

    return new Response(JSON.stringify({ success: true, data: order }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const status = errorFields(err).status ?? 500;
    return new Response(
      JSON.stringify({ success: false, error: errorFields(err).message || 'Server Error' }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
