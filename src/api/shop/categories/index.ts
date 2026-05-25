import type { APIRoute } from 'astro';
import { createPluginContext } from 'pelerin:plugin-sdk';
import { db, eq, categories, translations, products, sql as dbSql } from 'astro:db';
import { CreateCategorySchema } from '../../../schemas/category.schema.ts';

/**
 * Build a category tree from flat rows
 */
function buildTree(cats: any[]): any[] {
  const map = new Map(cats.map(c => [c.id, { ...c, children: [] }]));
  const roots: any[] = [];
  for (const c of map.values()) {
    if (c.parent_id) {
      const parent = map.get(c.parent_id);
      if (parent) parent.children.push(c);
      else roots.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

export const GET: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    // Fetch all categories ordered by sort_order
    const allCats = await db.select().from(categories).orderBy(categories.sort_order);

    // Fetch translations for the requested locale
    const categoryIds = allCats.map(c => c.id);
    let translationRows: any[] = [];
    if (categoryIds.length > 0) {
      translationRows = await db
        .select()
        .from(translations)
        .where(
          dbSql`${translations.entity_type} = 'category' AND ${translations.locale} = ${locale} AND ${translations.entity_id} IN (${dbSql.join(categoryIds.map(id => dbSql`${id}`))})`
        );
    }

    // Map translations by entity_id
    const transMap = new Map(translationRows.map(t => [t.entity_id, t]));

    // Enrich categories with translations (fall back to default locale columns)
    const enriched = allCats.map(c => {
      const t = transMap.get(c.id);
      return {
        id: c.id,
        parent_id: c.parent_id,
        name: t?.name ?? c.name,
        description: t?.description ?? c.description,
        slug: t?.slug ?? c.slug,
        sort_order: c.sort_order,
      };
    });

    const tree = buildTree(enriched);

    return new Response(JSON.stringify({ success: true, data: tree }), {
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

export const POST: APIRoute = async (context) => {
  const sdk = createPluginContext();

  try {
    await sdk.auth.requireAdmin(context.request);

    const body = await context.request.json();
    const result = CreateCategorySchema.safeParse(body);

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

    const id = crypto.randomUUID();
    const { name, description, slug, sort_order, parent_id } = result.data;

    await db.insert(categories).values({
      id,
      parent_id,
      name,
      description,
      slug,
      sort_order,
    });

    // Insert default locale translation
    await db.insert(translations).values({
      id: crypto.randomUUID(),
      entity_type: 'category',
      entity_id: id,
      locale: 'ro',
      name,
      description,
      slug,
      label: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: { id, parent_id, name, description, slug, sort_order },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
