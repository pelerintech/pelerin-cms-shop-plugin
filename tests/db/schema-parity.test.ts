import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

/**
 * Parse an astro:db config.ts file into a normalized schema structure.
 * Returns: { [tableName]: { [columnName]: { type, optional } } }
 *
 * Recognizes `const <name> = defineTable({ columns: { ... } })` blocks and
 * within them `column.text(...)`, `column.number(...)`, `column.boolean(...)`,
 * `column.date(...)` calls, detecting `{ optional: true }`.
 */
function parseAstroDbConfig(source: string): Record<string, Record<string, { type: string; optional: boolean; unique: boolean }>> {
  const tables: Record<string, Record<string, { type: string; optional: boolean; unique: boolean }>> = {};
  // Match each `const <name> = defineTable({ ... });` block (non-greedy across the object)
  const tableRegex = /const\s+(\w+)\s*=\s*defineTable\(\{[\s\S]*?columns:\s*\{([\s\S]*?)\n\s*\},\s*\}\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(source)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const cols: Record<string, { type: string; optional: boolean; unique: boolean }> = {};
    // Each column line: `<name>: column.<type>(<opts>)`
    const colRegex = /(\w+):\s*column\.(text|number|boolean|date)\(\s*({[\s\S]*?})?\)/g;
    let cm: RegExpExecArray | null;
    while ((cm = colRegex.exec(body)) !== null) {
      const colName = cm[1];
      const colType = cm[2];
      const opts = cm[3] || '';
      const optional = /optional:\s*true/.test(opts);
      const unique = /unique:\s*true/.test(opts);
      cols[colName] = { type: colType, optional, unique };
    }
    tables[tableName] = cols;
  }
  return tables;
}

/**
 * Parse a drizzle-orm/sqlite-core schema.ts file into the same normalized structure.
 * Recognizes `export const <name> = sqliteTable('<dbName>', { ... })` blocks and
 * within them `text('...')`, `integer('...')` calls with `.notNull()` / mode flags.
 *
 * Type normalization:
 *   text('...')      → type 'text'
 *   integer('...', { mode: 'boolean' }) → type 'boolean'
 *   integer('...', { mode: 'timestamp' }) → type 'date'
 *   integer('...')   → type 'number'
 *   .notNull()       → optional: false
 *   (no .notNull())  → optional: true
 */
function parseDrizzleSchema(source: string): Record<string, Record<string, { type: string; optional: boolean; unique: boolean }>> {
  const tables: Record<string, Record<string, { type: string; optional: boolean; unique: boolean }>> = {};
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*sqliteTable\([^,]+,\s*\{([\s\S]*?)\n\}\)/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(source)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const cols: Record<string, { type: string; optional: boolean; unique: boolean }>= {};
    // Each column line: `<prop>: <builder>('...'<, { mode: '...' }>)<.notNull()|.primaryKey()|.unique()>,`
    // Capture the full chain of method calls after the builder.
    const colRegex = /(\w+):\s*(text|integer|dateType)\(([^)]*)\)((?:\.(?:notNull|primaryKey|unique)\(\))*)/g;
    let cm: RegExpExecArray | null;
    while ((cm = colRegex.exec(body)) !== null) {
      const colName = cm[1];
      const builder = cm[2];
      const args = cm[3] || '';
      const chain = cm[4] || '';
      const notNull = /\.notNull\(\)/.test(chain) || /\.primaryKey\(\)/.test(chain);
      const unique = /\.unique\(\)/.test(chain);
      let type: string;
      if (builder === 'text') {
        type = 'text';
      } else if (builder === 'dateType') {
        type = 'date';
      } else if (/mode:\s*['"]boolean['"]/.test(args)) {
        type = 'boolean';
      } else if (/mode:\s*['"]timestamp/.test(args)) {
        type = 'date';
      } else {
        type = 'number';
      }
      cols[colName] = { type, optional: !notNull, unique };
    }
    tables[tableName] = cols;
  }
  return tables;
}

const configSource = readFileSync(new URL('../../src/db/config.ts', import.meta.url), 'utf-8');
const schemaSource = readFileSync(new URL('../../src/db/schema.ts', import.meta.url), 'utf-8');

const configTables = parseAstroDbConfig(configSource);
const schemaTables = parseDrizzleSchema(schemaSource);

test('both files declare the same set of table names', () => {
  const configNames = Object.keys(configTables).sort();
  const schemaNames = Object.keys(schemaTables).sort();
  assert.deepStrictEqual(schemaNames, configNames, `table name sets differ.\nconfig: ${configNames.join(', ')}\nschema: ${schemaNames.join(', ')}`);
});

for (const tableName of Object.keys(configTables)) {
  test(`table '${tableName}' has the same columns in both files`, () => {
    const configCols = Object.keys(configTables[tableName]).sort();
    const schemaCols = Object.keys(schemaTables[tableName] || {}).sort();
    assert.deepStrictEqual(schemaCols, configCols, `column sets differ for table ${tableName}.\nconfig: ${configCols.join(', ')}\nschema: ${schemaCols.join(', ')}`);
  });

  for (const colName of Object.keys(configTables[tableName])) {
    test(`column '${tableName}.${colName}' has matching type and optionality`, () => {
      const c = configTables[tableName][colName];
      const s = schemaTables[tableName]?.[colName];
      assert.ok(s, `column ${tableName}.${colName} missing from schema.ts`);
      assert.strictEqual(s.type, c.type, `type mismatch for ${tableName}.${colName}: config=${c.type} schema=${s.type}`);
      assert.strictEqual(s.optional, c.optional, `optionality mismatch for ${tableName}.${colName}: config.optional=${c.optional} schema.optional=${s.optional}`);
      assert.strictEqual(s.unique, c.unique, `unique mismatch for ${tableName}.${colName}: config.unique=${c.unique} schema.unique=${s.unique}`);
    });
  }
}

// ── r17: table-level indexes + table-level unique parity ──
// The column-level parser above only recognizes column-level `unique`. The spec
// (unique-constraints-and-indexes) requires the parity parser to ALSO recognize
// table-level `indexes` and table-level `unique(...)` and assert parity for every
// constraint/index across both files. (astro:db cannot declare a table-level
// composite UNIQUE — see decisions.md Option 1 — so `translations` uniqueness is
// app-level; both files therefore have ZERO table-level uniques, and parity is
// the empty set = empty set. The index parity is the meaningful assertion.)

/**
 * Parse table-level `indexes` blocks from an astro:db config.ts source.
 * Returns: { [tableName]: { [indexName]: string[] (sorted on-columns) } }
 * Recognizes `indexes: { <name>: { on: 'col' | ['c1','c2'] } }`.
 */
function parseAstroDbIndexes(source: string): Record<string, Record<string, string[]>> {
  const tables: Record<string, Record<string, string[]>> = {};
  // Match each `const <name> = defineTable({ ... });` block and capture the whole
  // object body so we can find an optional `indexes: { ... }` sub-block.
  const tableRegex = /const\s+(\w+)\s*=\s*defineTable\(\{([\s\S]*?)\n\}\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(source)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const idx: Record<string, string[]> = {};
    // Find the indexes block: `indexes: { <name>: { on: ... }, ... }`
    const idxBlockMatch = body.match(/indexes:\s*\{([\s\S]*?)\n\s*\}/);
    if (idxBlockMatch) {
      const idxBlock = idxBlockMatch[1];
      // Each entry: `<name>: { on: 'col' }` or `<name>: { on: ['c1', 'c2'] }`
      const entryRegex = /(\w+):\s*\{\s*on:\s*('([^']+)'|\[([^\]]*)\])\s*\}/g;
      let em: RegExpExecArray | null;
      while ((em = entryRegex.exec(idxBlock)) !== null) {
        const indexName = em[1];
        let cols: string[];
        if (em[3] !== undefined) {
          // single string form
          cols = [em[3]];
        } else {
          // array form: split on commas, strip quotes
          cols = em[4].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
        }
        idx[indexName] = cols.sort();
      }
    }
    tables[tableName] = idx;
  }
  return tables;
}

/**
 * Parse table-level `indexes` blocks from a drizzle schema.ts source.
 * Returns: { [tableName]: { [indexName]: string[] (sorted on-columns) } }
 * Recognizes the `(table) => ({ <name>: index('...').on(table.c1, table.c2) })` callback.
 */
function parseDrizzleIndexes(source: string): Record<string, Record<string, string[]>> {
  const tables: Record<string, Record<string, string[]>> = {};
  // Split on table declarations so a non-greedy match can never cross from a
  // table without a callback into the next table's callback body.
  const parts = source.split(/export\s+const\s+(\w+)\s*=\s*sqliteTable\(/);
  // parts[0] is preamble; then pairs of (tableName, rest-up-to-next-split).
  for (let i = 1; i < parts.length; i += 2) {
    const tableName = parts[i];
    const rest = parts[i + 1] ?? '';
    const idx: Record<string, string[]> = {};
    // The index callback (if any) is the third arg: `, (table) => ({ ... })`.
    const cbMatch = rest.match(/,\s*\(\s*\w+\s*\)\s*=>\s*\(\{([\s\S]*?)\n\s*\}\s*\)\s*\);/);
    if (cbMatch) {
      const body = cbMatch[1];
      // Each entry: `<indexName>: index('...idx').on(table.c1, table.c2),`
      const entryRegex = /(\w+):\s*index\([^)]*\)\.on\(([^)]*)\)/g;
      let em: RegExpExecArray | null;
      while ((em = entryRegex.exec(body)) !== null) {
        const indexName = em[1];
        const onArgs = em[2];
        const cols = onArgs.split(',').map((s) => s.trim().replace(/^table\./, '')).filter(Boolean);
        idx[indexName] = cols.sort();
      }
    }
    tables[tableName] = idx;
  }
  return tables;
}

const configIndexes = parseAstroDbIndexes(configSource);
const schemaIndexes = parseDrizzleIndexes(schemaSource);

test('r17: every table has the same set of index names in both files', () => {
  for (const tableName of Object.keys(configTables)) {
    const configNames = Object.keys(configIndexes[tableName] || {}).sort();
    const schemaNames = Object.keys(schemaIndexes[tableName] || {}).sort();
    assert.deepStrictEqual(
      schemaNames,
      configNames,
      `index name sets differ for table ${tableName}.\nconfig: ${configNames.join(', ')}\nschema: ${schemaNames.join(', ')}`,
    );
  }
});

test('r17: each index has matching on-columns in both files', () => {
  for (const tableName of Object.keys(configTables)) {
    const cIdx = configIndexes[tableName] || {};
    for (const indexName of Object.keys(cIdx)) {
      const sCols = schemaIndexes[tableName]?.[indexName];
      assert.ok(sCols, `index ${tableName}.${indexName} missing from schema.ts`);
      assert.deepStrictEqual(
        sCols,
        cIdx[indexName],
        `index on-columns differ for ${tableName}.${indexName}: config=${cIdx[indexName].join(',')} schema=${sCols.join(',')}`,
      );
    }
  }
});

test('r17: cart_items has the expected FK indexes (parity smoke check)', () => {
  const expected = ['cart_items_cart_id_idx', 'cart_items_product_id_idx', 'cart_items_variant_id_idx'].sort();
  assert.deepStrictEqual(Object.keys(configIndexes['cart_items'] || {}).sort(), expected);
  assert.deepStrictEqual(Object.keys(schemaIndexes['cart_items'] || {}).sort(), expected);
});

// ── r16: order_refunds table, partially_refunded status, unique order_number ──

test('order_refunds table exists in both config.ts and schema.ts', () => {
  assert.ok(configTables['order_refunds'], 'order_refunds missing from config.ts');
  assert.ok(schemaTables['order_refunds'], 'order_refunds missing from schema.ts');
});

test('order_refunds table has the expected columns with correct optionality', () => {
  const expected: Record<string, { type: string; optional: boolean }> = {
    id: { type: 'text', optional: false },
    order_id: { type: 'text', optional: false },
    order_item_id: { type: 'text', optional: false },
    quantity: { type: 'number', optional: false },
    amount: { type: 'number', optional: true },
    notes: { type: 'text', optional: true },
    created_at: { type: 'date', optional: false },
    created_by: { type: 'text', optional: true },
  };
  for (const [col, spec] of Object.entries(expected)) {
    const c = configTables['order_refunds']?.[col];
    const s = schemaTables['order_refunds']?.[col];
    assert.ok(c, `config.ts order_refunds.${col} missing`);
    assert.ok(s, `schema.ts order_refunds.${col} missing`);
    assert.strictEqual(c.type, spec.type, `config order_refunds.${col} type`);
    assert.strictEqual(c.optional, spec.optional, `config order_refunds.${col} optional`);
    assert.strictEqual(s.type, spec.type, `schema order_refunds.${col} type`);
    assert.strictEqual(s.optional, spec.optional, `schema order_refunds.${col} optional`);
  }
});

test('orders.order_number is unique in both config.ts and schema.ts', () => {
  const c = configTables['orders']?.['order_number'];
  const s = schemaTables['orders']?.['order_number'];
  assert.ok(c, 'config.ts orders.order_number missing');
  assert.ok(s, 'schema.ts orders.order_number missing');
  assert.strictEqual(c.unique, true, 'config.ts orders.order_number must be unique');
  assert.strictEqual(s.unique, true, 'schema.ts orders.order_number must be unique');
});

const enumsSource = readFileSync(new URL('../../src/schemas/enums.ts', import.meta.url), 'utf-8');

test('OrderStatus enum includes partially_refunded', () => {
  assert.match(enumsSource, /'partially_refunded'/, 'enums.ts OrderStatus must include partially_refunded');
});

// ── r18: product_images enriched metadata columns + url-holds-a-key comment ──

test('r18: product_images has the 5 enriched metadata columns in config.ts', () => {
  const cols = configTables['product_images'];
  assert.ok(cols, 'product_images missing from config.ts');
  const expected: Record<string, { type: string; optional: boolean }> = {
    mime: { type: 'text', optional: false },
    size: { type: 'number', optional: false },
    width: { type: 'number', optional: true },
    height: { type: 'number', optional: true },
    original_filename: { type: 'text', optional: true },
  };
  for (const [col, spec] of Object.entries(expected)) {
    const c = cols[col];
    assert.ok(c, `config.ts product_images.${col} missing`);
    assert.strictEqual(c.type, spec.type, `config product_images.${col} type`);
    assert.strictEqual(c.optional, spec.optional, `config product_images.${col} optional`);
  }
});

test('r18: product_images has the 5 enriched metadata columns in schema.ts', () => {
  const cols = schemaTables['product_images'];
  assert.ok(cols, 'product_images missing from schema.ts');
  const expected: Record<string, { type: string; optional: boolean }> = {
    mime: { type: 'text', optional: false },
    size: { type: 'number', optional: false },
    width: { type: 'number', optional: true },
    height: { type: 'number', optional: true },
    original_filename: { type: 'text', optional: true },
  };
  for (const [col, spec] of Object.entries(expected)) {
    const s = cols[col];
    assert.ok(s, `schema.ts product_images.${col} missing`);
    assert.strictEqual(s.type, spec.type, `schema product_images.${col} type`);
    assert.strictEqual(s.optional, spec.optional, `schema product_images.${col} optional`);
  }
});

test('r18: product_images existing columns + byProductId index are unchanged', () => {
  const c = configTables['product_images'];
  const s = schemaTables['product_images'];
  const base: Record<string, { type: string; optional: boolean }> = {
    id: { type: 'text', optional: false },
    product_id: { type: 'text', optional: false },
    variant_id: { type: 'text', optional: true },
    url: { type: 'text', optional: false },
    alt: { type: 'text', optional: true },
    sort_order: { type: 'number', optional: false },
  };
  for (const [col, spec] of Object.entries(base)) {
    assert.strictEqual(c[col].type, spec.type, `config product_images.${col} type`);
    assert.strictEqual(c[col].optional, spec.optional, `config product_images.${col} optional`);
    assert.strictEqual(s[col].type, spec.type, `schema product_images.${col} type`);
    assert.strictEqual(s[col].optional, spec.optional, `schema product_images.${col} optional`);
  }
  assert.deepStrictEqual(
    Object.keys(configIndexes['product_images'] || {}).sort(),
    ['product_images_product_id_idx'],
    'product_images index set changed',
  );
  assert.deepStrictEqual(
    Object.keys(schemaIndexes['product_images'] || {}).sort(),
    ['product_images_product_id_idx'],
    'product_images index set changed',
  );
});

test('r18: url column comment in both schema files documents the key lie', () => {
  assert.match(configSource, /url:[\s\S]*?\/\/.*storage.*key/i, 'config.ts product_images.url must have a key comment');
  assert.match(schemaSource, /url:[\s\S]*?\/\/.*storage.*key/i, 'schema.ts product_images.url must have a key comment');
});
