import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, and, categories, translations, products, sql as dbSql } from 'astro:db';
import { UpdateCategorySchema } from '../../../../schemas/category.schema.ts';

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const [cat] = await db.select().from(categories).where(eq(categories.id, id));
    if (!cat) {
      return new Response(JSON.stringify({ success: false, error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch all translations for this category
    const transRows = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entity_type, 'category'),
          eq(translations.entity_id, id)
        )
      );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...cat,
          translations: transRows,
        },
      }),
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

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const [existing] = await db.select().from(categories).where(eq(categories.id, id));
    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const result = UpdateCategorySchema.safeParse(body);

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

    const updateData: Record<string, any> = {};
    if (result.data.parent_id !== undefined) updateData.parent_id = result.data.parent_id;
    if (result.data.name !== undefined) updateData.name = result.data.name;
    if (result.data.description !== undefined) updateData.description = result.data.description;
    if (result.data.slug !== undefined) updateData.slug = result.data.slug;
    if (result.data.sort_order !== undefined) updateData.sort_order = result.data.sort_order;

    if (Object.keys(updateData).length > 0) {
      await db.update(categories).set(updateData).where(eq(categories.id, id));
    }

    const [updated] = await db.select().from(categories).where(eq(categories.id, id));

    return new Response(
      JSON.stringify({ success: true, data: updated }),
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

export const DELETE: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id } = context.params;

    const [existing] = await db.select().from(categories).where(eq(categories.id, id));
    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check for children
    const children = await db
      .select()
      .from(categories)
      .where(eq(categories.parent_id, id));

    if (children.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot delete category with children' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for associated products
    const associatedProducts = await db
      .select()
      .from(products)
      .where(eq(products.category_id, id));

    if (associatedProducts.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot delete category with products' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete translations first
    await db
      .delete(translations)
      .where(
        and(
          eq(translations.entity_type, 'category'),
          eq(translations.entity_id, id)
        )
      );

    // Delete the category
    await db.delete(categories).where(eq(categories.id, id));

    return new Response(JSON.stringify({ success: true, data: null }), {
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
};
