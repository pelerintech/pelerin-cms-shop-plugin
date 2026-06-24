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
function parseAstroDbConfig(source: string): Record<string, Record<string, { type: string; optional: boolean }>> {
  const tables: Record<string, Record<string, { type: string; optional: boolean }>> = {};
  // Match each `const <name> = defineTable({ ... });` block (non-greedy across the object)
  const tableRegex = /const\s+(\w+)\s*=\s*defineTable\(\{[\s\S]*?columns:\s*\{([\s\S]*?)\n\s*\},\s*\}\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(source)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const cols: Record<string, { type: string; optional: boolean }> = {};
    // Each column line: `<name>: column.<type>(<opts>)`
    const colRegex = /(\w+):\s*column\.(text|number|boolean|date)\(\s*({[\s\S]*?})?\)/g;
    let cm: RegExpExecArray | null;
    while ((cm = colRegex.exec(body)) !== null) {
      const colName = cm[1];
      const colType = cm[2];
      const opts = cm[3] || '';
      const optional = /optional:\s*true/.test(opts);
      cols[colName] = { type: colType, optional };
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
function parseDrizzleSchema(source: string): Record<string, Record<string, { type: string; optional: boolean }>> {
  const tables: Record<string, Record<string, { type: string; optional: boolean }>> = {};
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*sqliteTable\([^,]+,\s*\{([\s\S]*?)\n\}\)/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(source)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const cols: Record<string, { type: string; optional: boolean }>= {};
    // Each column line: `<prop>: <builder>('...'<, { mode: '...' }>)<.notNull()|.primaryKey()>,`
    const colRegex = /(\w+):\s*(text|integer|dateType)\(([^)]*)\)(\.(?:notNull|primaryKey)\(\))?/g;
    let cm: RegExpExecArray | null;
    while ((cm = colRegex.exec(body)) !== null) {
      const colName = cm[1];
      const builder = cm[2];
      const args = cm[3] || '';
      const notNull = !!cm[4];
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
      cols[colName] = { type, optional: !notNull };
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
    });
  }
}
