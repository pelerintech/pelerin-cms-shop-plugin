import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db } from 'astro:db';
import { CreateAttributeAssignmentSchema } from '../../../../../schemas/product.schema';
import {
  listAssignments,
  createAssignment,
  AssignmentConflictError,
} from '../../../../../lib/data/attribute-assignments';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const GET: APIRoute = (context) =>
  runGet({ db, sdk: createPluginContext(), ctx: context });

export const POST: APIRoute = (context) =>
  runPost({ db, sdk: createPluginContext(), ctx: context });

export async function runGet({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const productId = ctx.params.id!;
    const url = new URL(ctx.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    const enriched = await listAssignments(db, productId, locale);

    return new Response(
      JSON.stringify({ success: true, data: enriched }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function runPost({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const productId = ctx.params.id!;
    const body = await ctx.request.json();
    const result = CreateAttributeAssignmentSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          fields: Object.fromEntries(
            result.error.issues.map(i => [i.path.join('.'), i.message])
          ),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { attribute_id, role, sort_order, offered_option_ids } = result.data;
    const data = await createAssignment(db, {
      product_id: productId,
      attribute_id,
      role,
      sort_order,
      offered_option_ids,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: data.id,
          product_id: productId,
          attribute_id,
          role,
          sort_order,
          offered_option_ids: offered_option_ids || [],
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (err instanceof AssignmentConflictError) {
      const codeMap: Record<string, number> = {
        not_found: 404,
        duplicate: 409,
        invalid_dimension: 422,
        has_variants: 409,
        conflict: 409,
      };
      const status = codeMap[err.code] ?? 409;
      const body: any = { success: false, error: err.message };
      if (err.code === 'invalid_dimension') {
        body.fields = { offered_option_ids: err.message };
      }
      return new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json' },
      });
    }
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
