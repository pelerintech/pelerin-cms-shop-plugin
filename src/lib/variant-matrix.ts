/**
 * Pure, browser-free client logic for the "Manage Variants" matrix
 * (shop-r15 redesign of the r12 "Generate Variants" flow).
 *
 * Extracted from the inline `<script>` of `src/pages/admin/products/[id].astro`
 * so the Cartesian-product, exists-detection, auto-SKU, and selected-combos
 * mapping are unit-testable under bare `node --test` (no DOM, no fetch, no
 * Astro). The page script becomes a thin caller: fetch dimensions + existing
 * variants, call `computeMatrix`, render rows, on submit call
 * `selectedCombinations` and POST.
 *
 * Design refs: shop-r15 design.md "Client logic extraction";
 * manage-variants-matrix.spec.md.
 */

export interface DimensionForMatrix {
  attribute_id: string;
  attribute_name: string;
  options: { id: string; label: string; value: string }[];
}

export interface ExistingVariant {
  id: string;
  /** One option_id per dimension, in the same dimension order as `dimensions`. */
  option_ids: string[];
}

export interface MatrixRow {
  /** One option_id per dimension, in dimension order. */
  option_ids: string[];
  /** One label per dimension (option label, falling back to value). */
  labels: string[];
  /** `${productSlug}-${optionValues.join('-')}` lowercased. */
  auto_sku: string;
  /** True iff an existing variant has exactly this set of option_ids. */
  exists: boolean;
  /** Present only when `exists` is true — the matched existing variant id. */
  existing_variant_id?: string;
}

/**
 * Compute the full Cartesian-product matrix of all dimension options.
 *
 * - One row per combination of (one option per dimension).
 * - `auto_sku` = `${productSlug}-${optionValues.join('-')}` lowercased,
 *   matching the original inline generation in `[id].astro`.
 * - `exists` = true iff an existing variant's `option_ids` set equals the
 *   row's `option_ids` set (same size, all elements present — order-independent
 *   since the same dimension order is used on both sides).
 */
export function computeMatrix(
  dimensions: DimensionForMatrix[],
  existing: ExistingVariant[],
  productSlug: string
): MatrixRow[] {
  const combos = cartesianProduct(dimensions.map((d) => d.options));
  return combos.map((combo) => {
    const option_ids = combo.map((o) => o.id);
    const labels = combo.map((o) => o.label || o.value);
    const optionValues = combo
      .map((o) => o.value)
      .join('-')
      .toLowerCase();
    const auto_sku = `${productSlug}-${optionValues}`;
    const match = existing.find((ev) => sameOptionSet(ev.option_ids, option_ids));
    return {
      option_ids,
      labels,
      auto_sku,
      exists: !!match,
      existing_variant_id: match?.id,
    };
  });
}

/**
 * Map the matrix + the merchant's selection (which rows are checked, their
 * edited SKU/stock) to the API payload for "Create Selected".
 *
 * - Only selected AND non-existing rows are returned (existing variants are
 *   not re-creatable).
 * - `sku` falls back to the row's `auto_sku` if the merchant left it blank.
 * - `stock` defaults to 0 if blank.
 */
export function selectedCombinations(
  rows: MatrixRow[],
  selectedIndices: number[],
  skus: Record<number, string>,
  stocks: Record<number, number>
): { option_ids: string[]; sku: string; stock: number }[] {
  return selectedIndices
    .filter((i) => !rows[i]?.exists)
    .map((i) => {
      const row = rows[i];
      const sku = (skus[i] ?? '').trim() || row.auto_sku;
      const stock = stocks[i] ?? 0;
      return { option_ids: row.option_ids, sku, stock };
    });
}

/** Cartesian product of arrays (preserving the input order per axis). */
function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce(
    (acc, axis) => acc.flatMap((prefix) => axis.map((item) => [...prefix, item])),
    [[]] as T[][]
  );
}

/** Two option_id arrays match iff same size and every element of A is in B. */
function sameOptionSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (const id of a) {
    if (!b.includes(id)) return false;
  }
  return true;
}
