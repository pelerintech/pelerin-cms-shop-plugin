import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, and, translations } from 'astro:db';

export const PUT: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);
    const { id, locale } = context.params;

    const body = await context.request.json();

    // Check if translation already exists for this entity + locale
    const [existing] = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entity_type, 'product'),
          eq(translations.entity_id, id),
          eq(translations.locale, locale)
        )
      );

    if (existing) {
      // Update existing translation
      const updateData: Record<string, any> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.slug !== undefined) updateData.slug = body.slug;

      if (Object.keys(updateData).length > 0) {
        await db
          .update(translations)
          .set(updateData)
          .where(
            and(
              eq(translations.entity_type, 'product'),
              eq(translations.entity_id, id),
              eq(translations.locale, locale)
            )
          );
      }

      const [updated] = await db
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product'),
            eq(translations.entity_id, id),
            eq(translations.locale, locale)
          )
        );

      return new Response(JSON.stringify({ success: true, data: updated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // Create new translation
      const newId = crypto.randomUUID();
      await db.insert(translations).values({
        id: newId,
        entity_type: 'product',
        entity_id: id,
        locale,
        name: body.name ?? null,
        description: body.description ?? null,
        slug: body.slug ?? null,
        label: null,
      });

      const [created] = await db
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.entity_type, 'product'),
            eq(translations.entity_id, id),
            eq(translations.locale, locale)
          )
        );

      return new Response(JSON.stringify({ success: true, data: created }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};