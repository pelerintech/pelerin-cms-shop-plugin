import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { deleteAssignment, AssignmentConflictError } from '../../../../../lib/data/attribute-assignments';
import type { HandlerDeps } from '../../../../../lib/handler-types';

export const DELETE: APIRoute = (context) => { const sdk = createPluginContext(); return runDelete({ db: sdk.db, sdk, ctx: context }); }

export async function runDelete({ db, sdk, ctx }: HandlerDeps): Promise<Response> {
  try {
    await sdk.auth.requireAdmin(ctx.request);

    const assignmentId = ctx.params.assignmentId!;
    await deleteAssignment(db, assignmentId);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (err instanceof AssignmentConflictError) {
      const codeMap: Record<string, number> = {
        not_found: 404,
        has_variants: 409,
        conflict: 409,
      };
      const status = codeMap[err.code] ?? 409;
      return new Response(JSON.stringify({ success: false, error: err.message }), {
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
