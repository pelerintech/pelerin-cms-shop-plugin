import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, product_attribute_assignments, product_attribute_values, product_variants, sql as dbSql } from 'astro:db';

export const DELETE: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const assignmentId = context.params.assignmentId!;

    // Fetch the assignment
    const result = await db
      .select()
      .from(product_attribute_assignments)
      .where(dbSql`${product_attribute_assignments.id} = ${assignmentId}`);

    if (result.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Assignment not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const assignment = result[0];

    // If role is dimension, check if product has variants
    if (assignment.role === 'dimension') {
      const variants = await db
        .select()
        .from(product_variants)
        .where(dbSql`${product_variants.product_id} = ${assignment.product_id}`);

      if (variants.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Cannot remove dimension attribute that has existing variants. Delete variants first.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Delete attribute values for this assignment (both product and variant level)
    await db.run(
      dbSql`DELETE FROM ${product_attribute_values} WHERE ${product_attribute_values.assignment_id} = ${assignmentId}`
    );

    // Delete the assignment
    const deleteResult = await db.run(
      dbSql`DELETE FROM ${product_attribute_assignments} WHERE ${product_attribute_assignments.id} = ${assignmentId}`
    );

    if (!deleteResult.changes || deleteResult.changes === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Assignment not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
