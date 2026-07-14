import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as schema from '../../src/db/schema.ts';

// Drizzle table columns are accessible as direct properties on the table object.
// Column objects have:
//   .primary — boolean (true if .primaryKey())
//   .columnType — string ('SQLiteText', 'SQLiteInteger', 'SQLiteBoolean', 'SQLiteCustomColumn')
//   .dataType — string ('string', 'number', 'boolean', 'custom')
//   .notNull — boolean
//   .mapTo / .mapFrom — functions (only present on customType columns like dateType)

const EXPECTED_TABLE_COUNT = 19;

describe('schema integrity', () => {
  // Collect all exported tables from schema.ts
  const tableEntries = Object.entries(schema).filter(
    ([key, val]) =>
      typeof val === 'object' &&
      val !== null &&
      val.constructor?.name === 'SQLiteTable' &&
      key !== 'dateType'
  );
  const tableNames = tableEntries.map(([name]) => name);

  test(`expected table count is ${EXPECTED_TABLE_COUNT}`, () => {
    assert.equal(
      tableEntries.length,
      EXPECTED_TABLE_COUNT,
      `Expected ${EXPECTED_TABLE_COUNT} tables, got ${tableEntries.length}: ${tableNames.join(', ')}`
    );
  });

  test('every exported table has a primary key', () => {
    const violations: string[] = [];
    for (const [name, table] of tableEntries) {
      const cols = Object.keys(table as object).filter(
        (k) => typeof (table as any)[k]?.primary === 'boolean'
      );
      const hasPk = cols.some((k) => (table as any)[k].primary);
      if (!hasPk) violations.push(name);
    }
    assert.equal(violations.length, 0, `Tables without primary key: ${violations.join(', ')}`);
  });

  test('all id columns are text().primaryKey()', () => {
    const violations: string[] = [];
    for (const [name, table] of tableEntries) {
      const idCol = (table as any).id;
      if (!idCol) {
        violations.push(`${name}: no id column`);
        continue;
      }
      if (!idCol.primary) {
        violations.push(`${name}.id: not a primary key`);
      }
      if (idCol.columnType !== 'SQLiteText') {
        violations.push(`${name}.id: not SQLiteText, got ${idCol.columnType}`);
      }
    }
    assert.equal(violations.length, 0, violations.join('\n'));
  });

  test('no duplicate column names within any table', () => {
    const violations: string[] = [];
    for (const [name, table] of tableEntries) {
      const colNames = Object.keys(table as object).filter(
        (k) => typeof (table as any)[k]?.columnType === 'string'
      );
      const seen = new Set<string>();
      for (const cn of colNames) {
        if (seen.has(cn)) {
          violations.push(`${name}: duplicate column "${cn}"`);
        }
        seen.add(cn);
      }
    }
    assert.equal(violations.length, 0, violations.join('\n'));
  });

  test('every table with created_at or updated_at uses dateType for both', () => {
    const violations: string[] = [];
    for (const [name, table] of tableEntries) {
      const t = table as any;
      const hasCreatedAt = 'created_at' in t && t.created_at?.columnType;
      const hasUpdatedAt = 'updated_at' in t && t.updated_at?.columnType;

      if (hasCreatedAt) {
        if (t.created_at.columnType !== 'SQLiteCustomColumn') {
          violations.push(`${name}.created_at: not dateType (got ${t.created_at.columnType})`);
        }
      }
      if (hasUpdatedAt) {
        if (t.updated_at.columnType !== 'SQLiteCustomColumn') {
          violations.push(`${name}.updated_at: not dateType (got ${t.updated_at.columnType})`);
        }
      }
    }
    assert.equal(violations.length, 0, violations.join('\n'));
  });
});
