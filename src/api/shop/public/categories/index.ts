import type { APIRoute } from 'astro';
import { db, categories, translations, sql as dbSql } from 'astro:db';

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
  try {
    const url = new URL(context.request.url);
    const locale = url.searchParams.get('locale') || 'ro';

    // Fetch all categories — public endpoint, no active filter (categories table has no active column)
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

    const transMap = new Map(translationRows.map(t => [t.entity_id, t]));

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
