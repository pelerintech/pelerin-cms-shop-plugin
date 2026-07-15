/**
 * Unit tests for `src/lib/variant-matrix.ts` — the extracted, pure, browser-free
 * client logic for the "Manage Variants" matrix (Tasks 3-5 of shop-r15).
 *
 * These run under bare `node --test` (no browser, no server, no Astro) because
 * the matrix logic is pure: Cartesian product, exists-detection, auto-SKU, and
 * selected-combinations mapping. The `<script>` in `[id].astro` becomes a thin
 * caller of these functions.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeMatrix,
  selectedCombinations,
  type DimensionForMatrix,
  type ExistingVariant,
} from '../../src/lib/variant-matrix.ts';

const colorDim: DimensionForMatrix = {
  attribute_id: 'attr-color',
  attribute_name: 'Color',
  options: [
    { id: 'red', label: 'Red', value: 'Red' },
    { id: 'green', label: 'Green', value: 'Green' },
    { id: 'blue', label: 'Blue', value: 'Blue' },
  ],
};

describe('computeMatrix — single dimension', () => {
  it('produces one row per option, all exists=false, auto_sku = slug-value', () => {
    const rows = computeMatrix([colorDim], [], 'tshirt');
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.equal(r.exists, false);
      assert.equal(r.existing_variant_id, undefined);
    }
    assert.deepEqual(
      rows.map((r) => r.auto_sku),
      ['tshirt-red', 'tshirt-green', 'tshirt-blue']
    );
    assert.deepEqual(rows[0].option_ids, ['red']);
    assert.deepEqual(rows[0].labels, ['Red']);
  });
});

const sizeDim: DimensionForMatrix = {
  attribute_id: 'attr-size',
  attribute_name: 'Size',
  options: [
    { id: 's', label: 'S', value: 'S' },
    { id: 'm', label: 'M', value: 'M' },
  ],
};

describe('computeMatrix — two dimensions + existing', () => {
  it('cartesian product 3x2 = 6 rows, auto_sku = slug-color-size', () => {
    const rows = computeMatrix([colorDim, sizeDim], [], 'tshirt');
    assert.equal(rows.length, 6);
    assert.deepEqual(
      rows.map((r) => r.auto_sku),
      [
        'tshirt-red-s',
        'tshirt-red-m',
        'tshirt-green-s',
        'tshirt-green-m',
        'tshirt-blue-s',
        'tshirt-blue-m',
      ]
    );
    // each row carries one option_id per dimension, in dimension order
    assert.deepEqual(rows[0].option_ids, ['red', 's']);
    assert.deepEqual(rows[0].labels, ['Red', 'S']);
  });

  it('marks the existing Red-S variant as exists=true with its id; others false', () => {
    const existing: ExistingVariant[] = [{ id: 'v-red-s', option_ids: ['red', 's'] }];
    const rows = computeMatrix([colorDim, sizeDim], existing, 'tshirt');
    const redS = rows.find((r) => r.option_ids[0] === 'red' && r.option_ids[1] === 's');
    assert.ok(redS, 'Red-S row should exist');
    assert.equal(redS!.exists, true);
    assert.equal(redS!.existing_variant_id, 'v-red-s');
    const others = rows.filter((r) => r !== redS);
    assert.equal(others.length, 5);
    for (const r of others) {
      assert.equal(r.exists, false, `row ${r.option_ids.join('/')} should not be exists`);
      assert.equal(r.existing_variant_id, undefined);
    }
  });
});

describe('selectedCombinations — filters to selected non-existing rows', () => {
  it('returns only selected non-existing rows with sku/stock, skips existing and unselected', () => {
    // 2x2 matrix: Red-S exists, plus Red-M, Green-S, Green-M (4 rows).
    const colorTwo: DimensionForMatrix = {
      attribute_id: 'attr-color',
      attribute_name: 'Color',
      options: [
        { id: 'red', label: 'Red', value: 'Red' },
        { id: 'green', label: 'Green', value: 'Green' },
      ],
    };
    const sizeTwo: DimensionForMatrix = {
      attribute_id: 'attr-size',
      attribute_name: 'Size',
      options: [
        { id: 's', label: 'S', value: 'S' },
        { id: 'm', label: 'M', value: 'M' },
      ],
    };
    const existing: ExistingVariant[] = [{ id: 'v-red-s', option_ids: ['red', 's'] }];
    const rows = computeMatrix([colorTwo, sizeTwo], existing, 'p');
    assert.equal(rows.length, 4);
    // Select index 0 (Red-S, existing — must be skipped) and 2 (Green-S — create).
    const combos = selectedCombinations(rows, [0, 2], { 2: 'p-green-s-custom' }, { 2: 7 });
    assert.deepEqual(combos, [{ option_ids: ['green', 's'], sku: 'p-green-s-custom', stock: 7 }]);
    // The existing row (index 0) was selected but is NOT in the output.
  });

  it('falls back to auto_sku when the merchant leaves sku blank, and stock defaults to 0', () => {
    const rows = computeMatrix([colorDim], [], 'tshirt'); // 3 rows
    const combos = selectedCombinations(rows, [0, 2], {}, {});
    assert.deepEqual(combos, [
      { option_ids: ['red'], sku: 'tshirt-red', stock: 0 },
      { option_ids: ['blue'], sku: 'tshirt-blue', stock: 0 },
    ]);
  });

  it('returns an empty array when nothing is selected', () => {
    const rows = computeMatrix([colorDim], [], 'tshirt');
    assert.deepEqual(selectedCombinations(rows, [], {}, {}), []);
  });
});
