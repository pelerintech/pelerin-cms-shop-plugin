import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const configContents = readFileSync(new URL('../../src/db/config.ts', import.meta.url), 'utf-8');

test('shop_settings table exists with required columns', () => {
  assert.ok(configContents.includes('const shop_settings = defineTable'), 'shop_settings table should be defined');
  assert.ok(configContents.includes('key: column.text()'), 'shop_settings should have key column');
  assert.ok(configContents.includes('value: column.text()'), 'shop_settings should have value column');
});

test('categories table exists with required columns', () => {
  assert.ok(configContents.includes('const categories = defineTable'), 'categories table should be defined');
  assert.ok(configContents.includes('parent_id: column.text({ optional: true })'), 'categories should have parent_id column');
  assert.ok(configContents.includes('name: column.text()'), 'categories should have name column');
  assert.ok(configContents.includes('description: column.text({ optional: true })'), 'categories should have description column');
  assert.ok(configContents.includes('slug: column.text()'), 'categories should have slug column');
  assert.ok(configContents.includes('sort_order: column.number()'), 'categories should have sort_order column');
});

test('translations table exists with required columns', () => {
  assert.ok(configContents.includes('const translations = defineTable'), 'translations table should be defined');
  assert.ok(configContents.includes('entity_type: column.text()'), 'translations should have entity_type column');
  assert.ok(configContents.includes('entity_id: column.text()'), 'translations should have entity_id column');
  assert.ok(configContents.includes('locale: column.text()'), 'translations should have locale column');
  assert.ok(configContents.includes('name: column.text({ optional: true })'), 'translations should have name column');
  assert.ok(configContents.includes('description: column.text({ optional: true })'), 'translations should have description column');
  assert.ok(configContents.includes('slug: column.text({ optional: true })'), 'translations should have slug column');
  assert.ok(configContents.includes('label: column.text({ optional: true })'), 'translations should have label column');
});

test('no shop_locales or shop_currencies tables exist', () => {
  assert.ok(!configContents.includes('const shop_locales = defineTable'), 'shop_locales table should NOT exist');
  assert.ok(!configContents.includes('const shop_currencies = defineTable'), 'shop_currencies table should NOT exist');
});
