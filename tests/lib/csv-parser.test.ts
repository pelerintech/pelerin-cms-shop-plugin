/**
 * Tests for src/lib/csv-parser.ts — the simple CSV → array-of-objects parser.
 *
 * Phase-1 parser: no quoted-field support. The template format avoids commas in
 * values. These tests pin the documented behaviour: header keys, trim values,
 * ignore empty lines, empty array for header-only input.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { parseCSV } from '../../src/lib/csv-parser.ts';

test('parseCSV returns array of objects keyed by header', () => {
  const text = 'sku,name,price\nTEST-001,Foo,10\nTEST-002,Bar,20';
  const rows = parseCSV(text);
  assert.ok(Array.isArray(rows));
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0], { sku: 'TEST-001', name: 'Foo', price: '10' });
  assert.deepStrictEqual(rows[1], { sku: 'TEST-002', name: 'Bar', price: '20' });
});

test('parseCSV trims whitespace around values and headers', () => {
  const text = 'sku , name , price\n TEST-001 , Foo , 10 \nTEST-002, Bar,20';
  const rows = parseCSV(text);
  assert.deepStrictEqual(rows[0], { sku: 'TEST-001', name: 'Foo', price: '10' });
  assert.deepStrictEqual(rows[1], { sku: 'TEST-002', name: 'Bar', price: '20' });
});

test('parseCSV ignores empty lines (including trailing newline)', () => {
  const text = 'sku,name\nTEST-001,Foo\n\n\nTEST-002,Bar\n\n';
  const rows = parseCSV(text);
  assert.strictEqual(rows.length, 2, 'empty lines must not produce rows');
  assert.strictEqual(rows[0].sku, 'TEST-001');
  assert.strictEqual(rows[1].sku, 'TEST-002');
});

test('parseCSV returns empty array for header-only CSV', () => {
  const text = 'sku,name,price';
  const rows = parseCSV(text);
  assert.deepStrictEqual(rows, []);
});

test('parseCSV returns empty array for empty/whitespace-only input', () => {
  assert.deepStrictEqual(parseCSV(''), []);
  assert.deepStrictEqual(parseCSV('   \n  \n'), []);
});

test('parseCSV handles a row with fewer values than headers (missing trailing → empty string)', () => {
  const text = 'sku,name,price\nTEST-001,Foo';
  const rows = parseCSV(text);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0], { sku: 'TEST-001', name: 'Foo', price: '' });
});

test('parseCSV handles a row with more values than headers (extra values dropped)', () => {
  const text = 'sku,name\nTEST-001,Foo,Extra,Values';
  const rows = parseCSV(text);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0], { sku: 'TEST-001', name: 'Foo' });
});
