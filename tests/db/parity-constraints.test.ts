import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

/**
 * Per-table table-level constraint shape parsed from both schema files.
 *   uniqueConstraints: array of { name?, columns: string[] }
 *   indexes:            array of { name?, columns: string[] }
 *
 * Column-level `unique` is already covered by schema-parity.test.ts; this file
 * focuses on the table-level (composite) `unique` and `indexes` constructs that
 * r17 introduces. The parser below mirrors the table-level block shape that
 * Task 1 locks in; Tasks 2 and 3 will populate the constraints/indexes.
 */

interface TableUnique { name?: string; columns: string[] }
interface TableIndex { name?: string; columns: string[] }
interface TableConstraints { unique: TableUnique[]; indexes: TableIndex[] }

/**
 * Parse astro:db config.ts table-level `unique` and `indexes` blocks.
 *
 * astro:db defineTable supports (verified at @astrojs/db dist/runtime):
 *   const t = defineTable({
 *     columns: { ... },
 *     unique: { byKey: unique().on(table.colA, table.colB) }   // optional
 *     indexes: { byKey: index('name').on(table.colA) }          // optional
 *   });
 *
 * We extract, per table, the list of table-level unique constraints (each with
 * the columns it covers) and the list of indexes (each with its columns).
 */
function parseAstroDbTableConstraints(source: string): Record<string, TableConstraints> {
  const out: Record<string, TableConstraints> = {};
  // Match `const <name> = defineTable({ ... });` capturing the full body.
  const tableRegex = /const\s+(\w+)\s*=\s*defineTable\(\{([\s\S]*?)\n\}\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(source)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const result: TableConstraints = { unique: [], indexes: [] };

    // astro:db does NOT support a table-level `unique` block (TableConfig has only
    // columns/indexes/foreignKeys). We still parse a hypothetical `unique:` block
    // for parity detection (and to flag any future mistaken addition).
    const uniqueBlockMatch = body.match(/\bunique\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (uniqueBlockMatch) {
      const block = uniqueBlockMatch[1];
      const entryRegex = /(\w+)\s*:\s*unique\([^)]*\)\s*\.on\(([\s\S]*?)\)/g;
      let em: RegExpExecArray | null;
      while ((em = entryRegex.exec(block)) !== null) {
        const cols = (em[2].match(/table\.(\w+)/g) || []).map(s => s.replace('table.', ''));
        result.unique.push({ name: em[1], columns: cols });
      }
    }

    // table-level `indexes` block (astro:db LegacyIndexConfig form):
    //   indexes: { <key>: { on: 'col' } }            (single column)
    //   indexes: { <key>: { on: ['colA', 'colB'] } }  (composite)
    const indexesBlockMatch = body.match(/\bindexes\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (indexesBlockMatch) {
      const block = indexesBlockMatch[1];
      const entryRegex = /(\w+)\s*:\s*\{\s*on\s*:\s*(\[[\s\S]*?\]|'[^']*'|"[^"]*")\s*\}/g;
      let em: RegExpExecArray | null;
      while ((em = entryRegex.exec(block)) !== null) {
        const raw = em[2];
        let cols: string[];
        if (raw.startsWith('[')) {
          cols = (raw.match(/'([^']*)'|"([^"]*)"/g) || []).map(s => s.replace(/['"]/g, ''));
        } else {
          cols = [raw.replace(/['"]/g, '')];
        }
        result.indexes.push({ name: em[1], columns: cols });
      }
    }

    out[tableName] = result;
  }
  return out;
}

/**
 * Parse drizzle-orm schema.ts table-level `unique` and `indexes`.
 *
 * drizzle-orm sqliteTable second arg is the config object:
 *   export const t = sqliteTable('t', { ... }, (table) => ({
 *     byKey: unique('name').on(table.colA, table.colB),
 *     byIdx: index('name').on(table.colA),
 *   }));
 *
 * We extract, per table, the list of unique constraints and indexes with their
 * columns.
 */
function parseDrizzleTableConstraints(source: string): Record<string, TableConstraints> {
  const out: Record<string, TableConstraints> = {};
  // sqliteTable('name', { ... })                      OR
  // sqliteTable('name', { ... }, (table) => ({ ... }))
  // The columns block is non-greedy up to the first `\n}`; the third-arg config
  // block is OPTIONAL so tables without it still parse (and produce empty
  // constraints), preventing greedy cross-table span.
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*sqliteTable\([^,]+,\s*\{([\s\S]*?)\n\}\s*(?:,\s*(?:\(table\)\s*=>\s*)?\(\{([\s\S]*?)\n\s*\}\s*\))?\)/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(source)) !== null) {
    const tableName = m[1];
    const body = m[3] || '';
    const result: TableConstraints = { unique: [], indexes: [] };

    // unique('name').on(table.colA, table.colB)
    const uniqueRegex = /(\w+)\s*:\s*unique\(([^)]*)\)\s*\.on\(([\s\S]*?)\)/g;
    let um: RegExpExecArray | null;
    while ((um = uniqueRegex.exec(body)) !== null) {
      const cols = (um[3].match(/table\.(\w+)/g) || []).map(s => s.replace('table.', ''));
      result.unique.push({ name: um[1], columns: cols });
    }

    // index('name').on(table.colA)
    const indexRegex = /(\w+)\s*:\s*index\(([^)]*)\)\s*\.on\(([\s\S]*?)\)/g;
    let im: RegExpExecArray | null;
    while ((im = indexRegex.exec(body)) !== null) {
      const cols = (im[3].match(/table\.(\w+)/g) || []).map(s => s.replace('table.', ''));
      result.indexes.push({ name: im[1], columns: cols });
    }

    out[tableName] = result;
  }
  return out;
}

const configSource = readFileSync(new URL('../../src/db/config.ts', import.meta.url), 'utf-8');
const schemaSource = readFileSync(new URL('../../src/db/schema.ts', import.meta.url), 'utf-8');

const configConstraints = parseAstroDbTableConstraints(configSource);
const schemaConstraints = parseDrizzleTableConstraints(schemaSource);

test('parser recognizes table-level unique constructs (lock parser shape)', () => {
  // Sanity: the parser must extract columns from a known unique().on(...) form.
  // We assert the helper produces the expected column list on a synthetic string.
  const synthetic = `export const t = sqliteTable('t', {\n a: text('a').notNull(),\n b: text('b').notNull(),\n}, (table) => ({\n byAB: unique('uq').on(table.a, table.b),\n byIdx: index('ix').on(table.a),\n}))`;
  const parsed = parseDrizzleTableConstraints(synthetic);
  assert.ok(parsed['t'], 'parser must find table t');
  assert.deepStrictEqual(parsed['t'].unique, [{ name: 'byAB', columns: ['a', 'b'] }]);
  assert.deepStrictEqual(parsed['t'].indexes, [{ name: 'byIdx', columns: ['a'] }]);
});

test('parser recognizes astro:db table-level unique/indexes (lock parser shape)', () => {
  const synthetic = `const t = defineTable({\n columns: {\n  a: column.text(),\n  b: column.text(),\n },\n indexes: {\n  byA: { on: 'a' },\n  byAB: { on: ['a', 'b'] },\n },\n})`;
  const parsed = parseAstroDbTableConstraints(synthetic);
  assert.ok(parsed['t'], 'parser must find table t');
  assert.deepStrictEqual(parsed['t'].unique, []);
  assert.deepStrictEqual(parsed['t'].indexes, [{ name: 'byA', columns: ['a'] }, { name: 'byAB', columns: ['a', 'b'] }]);
});

test('r17: NO table-level composite unique in EITHER file (astro:db unsupported; uniqueness is column-level DB or app-level)', () => {
  // astro:db's asDrizzleTable runtime does not support table-level composite
  // unique (decisions.md 2026-06-24). Assert both files declare ZERO table-level
  // unique blocks so no one adds one that works in the schema.ts harness but is
  // silently ignored in prod (config.ts/astro:db). Single-column uniques are
  // column-level ({ unique: true } / .unique()); composite uniqueness is enforced
  // at the accessor layer (translations).
  const configTotal = Object.values(configConstraints).reduce((n, t) => n + t.unique.length, 0);
  const schemaTotal = Object.values(schemaConstraints).reduce((n, t) => n + t.unique.length, 0);
  assert.strictEqual(configTotal, 0, `config.ts must have 0 table-level unique (astro:db unsupported); found ${configTotal}`);
  assert.strictEqual(schemaTotal, 0, `schema.ts must have 0 table-level unique (parity); found ${schemaTotal}`);
});

test('r17: table-level indexes exist in both files (FK columns indexed)', () => {
  // Post-r17 state: FK-column indexes have been added (Task 3). This guards
  // against accidental removal and confirms both files carry them in parity
  // (the cross-file parity test below checks matching column-tuples per table).
  const configTotal = Object.values(configConstraints).reduce((n, t) => n + t.indexes.length, 0);
  const schemaTotal = Object.values(schemaConstraints).reduce((n, t) => n + t.indexes.length, 0);
  assert.ok(configTotal > 0, `config.ts expected FK indexes post-r17; found 0`);
  assert.strictEqual(schemaTotal, configTotal, `index count parity: config=${configTotal} schema=${schemaTotal}`);
});

test('r17: vouchers.code, referral_codes.code, categories.slug, shop_settings.key, products.sku, products.slug are column-level unique in both files', () => {
  // Column-level unique is checked by schema-parity.test.ts already; this is the
  // r17 explicit assertion so a future regression that drops the flag fails here.
  const expected = {
    vouchers: 'code',
    referral_codes: 'code',
    categories: 'slug',
    shop_settings: 'key',
    products: 'sku',
    products_duplicate: 'slug', // handled below
  };
  // products has TWO unique columns (sku, slug) — assert both via schema-parity
  // by re-reading the column-level parser inline here.
  function parseColumnUnique(src: string, builder: 'astro' | 'drizzle') {
    const out: Record<string, string[]> = {};
    if (builder === 'astro') {
      const re = /const\s+(\w+)\s*=\s*defineTable\(\{[\s\S]*?columns:\s*\{([\s\S]*?)\n\s*\},\s*\}/g;
      let m; while ((m = re.exec(src)) !== null) {
        const t = m[1]; const body = m[2]; const cols: string[] = [];
        const cr = /(\w+):\s*column\.(text|number|boolean|date)\([^)]*\)/g; let cm;
        while ((cm = cr.exec(body)) !== null) {
          if (/unique:\s*true/.test(cm[0])) cols.push(cm[1]);
        }
        if (cols.length) out[t] = cols;
      }
    } else {
      const re = /export\s+const\s+(\w+)\s*=\s*sqliteTable\([^,]+,\s*\{([\s\S]*?)\n\}\)/g;
      let m; while ((m = re.exec(src)) !== null) {
        const t = m[1]; const body = m[2]; const cols: string[] = [];
        const cr = /(\w+):\s*(text|integer|dateType)\([^)]*\)((?:\.(?:notNull|primaryKey|unique)\(\))*)/g; let cm;
        while ((cm = cr.exec(body)) !== null) { if (/\.unique\(\)/.test(cm[3])) cols.push(cm[1]); }
        if (cols.length) out[t] = cols;
      }
    }
    return out;
  }
  const cu = parseColumnUnique(configSource, 'astro');
  const su = parseColumnUnique(schemaSource, 'drizzle');
  for (const [t, col] of Object.entries(expected)) {
    if (t === 'products_duplicate') continue;
    assert.ok(cu[t]?.includes(col), `config.ts ${t}.${col} must be unique`);
    assert.ok(su[t]?.includes(col), `schema.ts ${t}.${col} must be unique`);
  }
  // products has both sku and slug unique
  assert.ok(cu['products']?.includes('sku') && cu['products']?.includes('slug'), 'config.ts products.{sku,slug} unique');
  assert.ok(su['products']?.includes('sku') && su['products']?.includes('slug'), 'schema.ts products.{sku,slug} unique');
});

test('r17: translations composite uniqueness is NOT a table-level DB constraint (app-level per Option 1)', () => {
  // astro:db's asDrizzleTable runtime does NOT support table-level composite unique
  // (see decisions.md 2026-06-24). The (entity_type, entity_id, locale) uniqueness is
  // enforced at the accessor layer (upsert: read-then-update-or-insert). Assert here
  // that NEITHER file declares a table-level unique on translations, so a future
  // agent doesn't add one that looks like it works in tests (schema.ts harness) but
  // is silently ignored in prod (config.ts/astro:db).
  const c = configConstraints['translations']?.unique || [];
  const s = schemaConstraints['translations']?.unique || [];
  assert.strictEqual(c.length, 0, `config.ts translations must NOT have table-level unique (unsupported by astro:db); found ${JSON.stringify(c)}`);
  assert.strictEqual(s.length, 0, `schema.ts translations must NOT have table-level unique (parity with config.ts); found ${JSON.stringify(s)}`);
});

test('table-level constraints are in parity across both files', () => {
  // For every table that has table-level constraints in EITHER file, the set of
  // unique-constraint column-tuples and index column-tuples must match.
  const allTables = new Set([...Object.keys(configConstraints), ...Object.keys(schemaConstraints)]);
  for (const tableName of allTables) {
    const c = configConstraints[tableName] || { unique: [], indexes: [] };
    const s = schemaConstraints[tableName] || { unique: [], indexes: [] };
    const cU = c.unique.map(u => u.columns.sort().join(',')).sort();
    const sU = s.unique.map(u => u.columns.sort().join(',')).sort();
    assert.deepStrictEqual(sU, cU, `table-level unique mismatch for ${tableName}\nconfig: ${cU.join(' | ')}\nschema: ${sU.join(' | ')}`);
    const cI = c.indexes.map(i => i.columns.sort().join(',')).sort();
    const sI = s.indexes.map(i => i.columns.sort().join(',')).sort();
    assert.deepStrictEqual(sI, cI, `table-level indexes mismatch for ${tableName}\nconfig: ${cI.join(' | ')}\nschema: ${sI.join(' | ')}`);
  }
});

// ── r17 Task 3: indexes on FK columns (design D1) ──

test('r17: indexes exist on every FK column listed in design D1 (both files, parity)', () => {
  // Expected: table -> set of indexed column-tuples (single-column unless noted).
  const expected: Record<string, string[][]> = {
    product_variants: [['product_id']],
    product_prices: [['product_id'], ['variant_id']],
    product_images: [['product_id']],
    product_attribute_assignments: [['attribute_id']],
    product_attribute_values: [['assignment_id'], ['option_id'], ['entity_id']],
    cart_items: [['cart_id'], ['product_id'], ['variant_id']],
    order_items: [['order_id'], ['product_id'], ['variant_id']],
    order_status_history: [['order_id']],
    categories: [['parent_id']],
    order_refunds: [['order_id'], ['order_item_id']],
    // translations: composite non-unique index for the app-level upsert lookup
    // (entity_type, entity_id, locale) — Option 1 (decisions.md 2026-06-24).
    translations: [['entity_type', 'entity_id', 'locale']],
  };
  for (const [table, colTuples] of Object.entries(expected)) {
    for (const cols of colTuples) {
      const key = cols.sort().join(',');
      const cIdx = (configConstraints[table]?.indexes || [])
        .map(i => i.columns.sort().join(','));
      const sIdx = (schemaConstraints[table]?.indexes || [])
        .map(i => i.columns.sort().join(','));
      assert.ok(
        cIdx.includes(key),
        `config.ts ${table} missing index on (${key}); found ${JSON.stringify(cIdx)}`,
      );
      assert.ok(
        sIdx.includes(key),
        `schema.ts ${table} missing index on (${key}); found ${JSON.stringify(sIdx)}`,
      );
    }
  }
});
