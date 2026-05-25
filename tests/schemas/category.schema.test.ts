import { test } from 'node:test';
import assert from 'node:assert';
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  CategoryOutputSchema,
} from '../../src/schemas/category.schema.ts';

test('CreateCategorySchema validates basic shape', () => {
  const good = CreateCategorySchema.safeParse({
    name: 'Electronice',
    slug: 'electronice',
    sort_order: 1,
  });
  assert.strictEqual(good.success, true);
});

test('CreateCategorySchema rejects empty name', () => {
  const bad = CreateCategorySchema.safeParse({
    name: '',
    slug: 'electronice',
  });
  assert.strictEqual(bad.success, false);
});

test('UpdateCategorySchema allows partial updates', () => {
  const partial = UpdateCategorySchema.safeParse({
    name: 'Updated',
  });
  assert.strictEqual(partial.success, true);
});

test('CategoryOutputSchema includes id and timestamps', () => {
  const parsed = CategoryOutputSchema.safeParse({
    id: 'cat-123',
    parent_id: null,
    name: 'Electronice',
    description: null,
    slug: 'electronice',
    sort_order: 1,
    created_at: new Date(),
    updated_at: new Date(),
  });
  assert.strictEqual(parsed.success, true);
});
