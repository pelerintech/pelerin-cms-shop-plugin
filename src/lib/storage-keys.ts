/**
 * Build the opaque storage key for a product image, mirroring the CMS media key
 * convention (`{collectionId}/{itemId}/{fieldName}/{ts}-{rand}-{sanitizedName}`)
 * adapted to the shop domain: `products/{productId}/{ts}-{rand}-{sanitizedName}`.
 *
 * Pure (no I/O, no SDK, no DB). Write-once opaque handle: the key is generated
 * once at upload and never mutated. The DB row (`product_id`, `variant_id`) is
 * the sole source of ownership — variant identity is NOT baked into the key path
 * (design D4).
 *
 * Sanitization mirrors the CMS media key: every character NOT in [a-zA-Z0-9.-]
 * is replaced with `_` (so "My Photo (1).PNG" → "My_Photo__1_.PNG").
 */
export function buildProductImageKey(productId: string, originalName: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 15);
  const sanitized = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `products/${productId}/${ts}-${rand}-${sanitized}`;
}
