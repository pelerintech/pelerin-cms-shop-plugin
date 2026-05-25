import { db, shop_settings, sql as dbSql } from 'astro:db';

async function getSetting(key: string): Promise<string | null> {
  const result = await db.run(
    dbSql`SELECT value FROM ${shop_settings} WHERE ${shop_settings.key} = ${key} LIMIT 1`
  );
  if (result.rows.length > 0) {
    return (result.rows[0] as any).value;
  }
  return null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.run(
    dbSql`SELECT id FROM ${shop_settings} WHERE ${shop_settings.key} = ${key} LIMIT 1`
  );
  if (existing.rows.length > 0) {
    await db.run(
      dbSql`UPDATE ${shop_settings} SET ${shop_settings.value} = ${value} WHERE ${shop_settings.key} = ${key}`
    );
  } else {
    await db.insert(shop_settings).values({
      id: crypto.randomUUID(),
      key,
      value,
    });
  }
}

/**
 * Generate the next order number using configured prefix, year, and padding.
 * Reads and atomically increments the sequence counter in shop_settings.
 */
export async function generateOrderNumber(): Promise<string> {
  const prefix = await getSetting('order_number_prefix') ?? 'ORD';
  const includeYear = (await getSetting('order_number_year')) !== 'false';
  const padding = parseInt(await getSetting('order_number_padding') ?? '5');

  // Read and increment sequence
  const current = parseInt(await getSetting('order_number_sequence') ?? '0');
  const next = current + 1;
  await setSetting('order_number_sequence', String(next));

  const year = includeYear ? `-${new Date().getFullYear()}` : '';
  const seq = String(next).padStart(padding, '0');
  return `${prefix}${year}-${seq}`;
}