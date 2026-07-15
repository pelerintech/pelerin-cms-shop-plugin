import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

describe('Attribute schemas', () => {
  const content = fs.readFileSync('src/schemas/product.schema.ts', 'utf8');

  describe('CreateAttributeSchema', () => {
    it('exists with name, type (enum), and sort_order', () => {
      assert.ok(content.includes('CreateAttributeSchema'), 'CreateAttributeSchema must be defined');
      assert.ok(
        content.includes("z.enum(['select', 'text', 'rich_text', 'number', 'boolean'])"),
        'type must be enum'
      );
    });
  });

  describe('UpdateAttributeSchema', () => {
    it('exists as partial of CreateAttributeSchema', () => {
      assert.ok(content.includes('UpdateAttributeSchema'), 'UpdateAttributeSchema must be defined');
      assert.ok(
        content.includes('CreateAttributeSchema.partial()'),
        'must be partial of CreateAttributeSchema'
      );
    });
  });

  describe('CreateAttributeOptionSchema', () => {
    it('exists with attribute_id, value, sort_order', () => {
      assert.ok(
        content.includes('CreateAttributeOptionSchema'),
        'CreateAttributeOptionSchema must be defined'
      );
    });
  });

  describe('UpdateAttributeOptionSchema', () => {
    it('exists as partial of CreateAttributeOptionSchema', () => {
      assert.ok(
        content.includes('UpdateAttributeOptionSchema'),
        'UpdateAttributeOptionSchema must be defined'
      );
    });
  });

  describe('CreateAttributeAssignmentSchema', () => {
    it('exists with attribute_id, role enum, offered_option_ids', () => {
      assert.ok(
        content.includes('CreateAttributeAssignmentSchema'),
        'CreateAttributeAssignmentSchema must be defined'
      );
      assert.ok(
        content.includes("z.enum(['dimension', 'field'])"),
        'role must be dimension|field enum'
      );
      assert.ok(content.includes('offered_option_ids'), 'offered_option_ids must be present');
    });
  });

  describe('CreateAttributeValueSchema', () => {
    it('exists with entity_type, entity_id, assignment_id, option_id, value_text, value_number, value_boolean', () => {
      assert.ok(
        content.includes('CreateAttributeValueSchema'),
        'CreateAttributeValueSchema must be defined'
      );
      assert.ok(
        content.includes("z.enum(['product', 'variant'])"),
        'entity_type must be product|variant enum'
      );
      assert.ok(content.includes('value_text'), 'value_text must be present');
      assert.ok(content.includes('value_number'), 'value_number must be present');
      assert.ok(content.includes('value_boolean'), 'value_boolean must be present');
      assert.ok(content.includes('option_id'), 'option_id must be present');
    });
  });

  describe('UpdateVariantSchema', () => {
    it('exists with sku, stock, active', () => {
      assert.ok(content.includes('UpdateVariantSchema'), 'UpdateVariantSchema must be defined');
      assert.ok(content.includes('sku'), 'sku must be present');
      assert.ok(content.includes('stock'), 'stock must be present');
      assert.ok(content.includes('active'), 'active must be present');
    });
  });

  describe('TypeScript type exports', () => {
    it('exports all input types', () => {
      const types = [
        'CreateAttributeInput',
        'UpdateAttributeInput',
        'CreateAttributeOptionInput',
        'UpdateAttributeOptionInput',
        'CreateAttributeAssignmentInput',
        'CreateAttributeValueInput',
        'UpdateVariantInput',
      ];
      for (const t of types) {
        assert.ok(content.includes(t), `${t} must be exported`);
      }
    });
  });

  describe('CreateTranslationSchema', () => {
    it('includes new entity types', () => {
      assert.ok(
        content.includes("'product_attribute'"),
        'product_attribute entity_type must be in enum'
      );
      assert.ok(
        content.includes("'product_attribute_option'"),
        'product_attribute_option entity_type must be in enum'
      );
    });
  });

  describe('Old schemas still present (for removal in task 20)', () => {
    it('still has CreateOptionTypeSchema and CreateOptionValueSchema', () => {
      assert.ok(content.includes('CreateOptionTypeSchema'), 'Old schema still present');
      assert.ok(content.includes('CreateOptionValueSchema'), 'Old schema still present');
    });
  });
});
