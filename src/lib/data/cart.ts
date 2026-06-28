/**
 * Data accessors for cart and cart items.
 * Uses inArray/eq — never the sql IN-join idiom.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { inArray, eq, and, isNull, lt, desc, count } from 'drizzle-orm';
import {
  carts,
  cart_items,
  products,
  product_variants,
  product_prices,
  product_attribute_values,
  product_attribute_assignments,
  product_attributes,
  translations,
} from '../../db/schema.ts';

export interface CartRow {
  id: string;
  session_id: string;
  user_id: string | null;
  applied_voucher_code: string | null;
  applied_referral_code: string | null;
  converted_at: Date | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface EnrichedCartItem {
  id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  price_net: number;
  vat_rate: number | null;
  currency: string;
  attributes: { attribute_name: string; attribute_type: string; role: string; value: string | number | boolean | null }[];
}

export interface CartWithItems {
  cart: CartRow;
  items: EnrichedCartItem[];
}

/** Get a cart by id, or null if not found. */
export async function getCartById(
  db: LibSQLDatabase,
  cartId: string,
): Promise<CartRow | null> {
  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
  return (cart as CartRow) ?? null;
}

/** Get a cart by session_id (non-expired), or null. */
export async function getCartBySession(
  db: LibSQLDatabase,
  sessionId: string,
): Promise<CartRow | null> {
  const now = new Date();
  const rows = await db.select().from(carts).where(eq(carts.session_id, sessionId));
  const cart = rows.find(c => c.expires_at > now);
  return (cart as CartRow) ?? null;
}

/** Create a new cart. Returns the created cart row. */
export async function createCart(
  db: LibSQLDatabase,
  input: { session_id: string; user_id?: string | null; expires_at?: Date },
): Promise<CartRow> {
  const now = new Date();
  const id = crypto.randomUUID();
  const expires = input.expires_at ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(carts).values({
    id,
    session_id: input.session_id,
    user_id: input.user_id ?? null,
    applied_voucher_code: null,
    applied_referral_code: null,
    converted_at: null,
    expires_at: expires,
    created_at: now,
    updated_at: now,
  });
  return (await getCartById(db, id))!;
}

/** Link a cart to a user_id (if not already linked). */
export async function linkCartToUser(
  db: LibSQLDatabase,
  cartId: string,
  userId: string,
): Promise<void> {
  await db.update(carts).set({ user_id: userId }).where(eq(carts.id, cartId));
}

/** Mark a cart as converted (after checkout). */
export async function markCartConverted(
  db: LibSQLDatabase,
  cartId: string,
): Promise<void> {
  await db.update(carts).set({ converted_at: new Date() }).where(eq(carts.id, cartId));
}

/** Get a cart with its items enriched (product name, price, variant attributes). */
export async function getCartWithItems(
  db: LibSQLDatabase,
  cartId: string,
  currency: string,
): Promise<CartWithItems | null> {
  const cart = await getCartById(db, cartId);
  if (!cart) return null;

  const items = await db.select().from(cart_items).where(eq(cart_items.cart_id, cartId));
  if (items.length === 0) return { cart, items: [] };

  const enriched = await enrichCartItems(db, items as any[], currency);
  return { cart, items: enriched };
}

/** Enrich raw cart_item rows with product name, price, variant attributes. */
export async function enrichCartItems(
  db: LibSQLDatabase,
  items: any[],
  currency: string,
): Promise<EnrichedCartItem[]> {
  if (items.length === 0) return [];

  const productIds = [...new Set(items.filter(i => i.product_id).map(i => i.product_id))];
  const variantIds = [...new Set(items.filter(i => i.variant_id).map(i => i.variant_id))];

  let productMap = new Map<string, any>();
  if (productIds.length > 0) {
    const prods = await db.select().from(products).where(inArray(products.id, productIds));
    for (const p of prods) productMap.set(p.id, p);
  }

  let variantMap = new Map<string, any>();
  if (variantIds.length > 0) {
    const vars = await db.select().from(product_variants).where(inArray(product_variants.id, variantIds));
    for (const v of vars) variantMap.set(v.id, v);
  }

  // Variant-level attribute values for variant cart items
  const variantAttributesMap = new Map<string, EnrichedCartItem['attributes']>();
  if (variantIds.length > 0) {
    const vavRows = await db
      .select()
      .from(product_attribute_values)
      .where(inArray(product_attribute_values.entity_id, variantIds));
    const variantVav = vavRows.filter(v => v.entity_type === 'variant');

    const assignmentIds = Array.from(new Set(variantVav.map(v => v.assignment_id)));
    const assignmentsMap = new Map<string, any>();
    if (assignmentIds.length > 0) {
      const assignments = await db.select().from(product_attribute_assignments).where(inArray(product_attribute_assignments.id, assignmentIds));
      for (const a of assignments) assignmentsMap.set(a.id, a);
    }

    const attributeIds = Array.from(new Set(Array.from(assignmentsMap.values()).map(a => a.attribute_id)));
    const attributesMap = new Map<string, any>();
    if (attributeIds.length > 0) {
      const attrs = await db.select().from(product_attributes).where(inArray(product_attributes.id, attributeIds));
      for (const attr of attrs) attributesMap.set(attr.id, attr);
    }

    const optionIds = Array.from(new Set(variantVav.map(v => v.option_id).filter(Boolean) as string[]));
    const optionLabelsMap = new Map<string, string>();
    if (optionIds.length > 0) {
      const optTransRows = await db.select().from(translations).where(inArray(translations.entity_id, optionIds));
      for (const t of optTransRows) {
        if (t.entity_type === 'product_attribute_option' && t.locale === 'ro' && t.label) {
          optionLabelsMap.set(t.entity_id, t.label);
        }
      }
    }

    for (const val of variantVav) {
      if (!variantAttributesMap.has(val.entity_id)) variantAttributesMap.set(val.entity_id, []);
      const assignment = assignmentsMap.get(val.assignment_id);
      const attr = assignment ? attributesMap.get(assignment.attribute_id) : null;
      let value: string | number | boolean | null = null;
      if (val.option_id) value = optionLabelsMap.get(val.option_id) || val.option_id;
      else if (val.value_text !== null) value = val.value_text;
      else if (val.value_number !== null) value = val.value_number;
      else if (val.value_boolean !== null) value = val.value_boolean;
      variantAttributesMap.get(val.entity_id)!.push({
        attribute_name: attr?.name || '',
        attribute_type: attr?.type || '',
        role: assignment?.role || '',
        value,
      });
    }
  }

  // Batched price fetch (r17 Task 10) — at most 2 product_prices queries
  // (one inArray(variant_id), one inArray(product_id)), built into a Map keyed
  // by (variantId|productId, currency). Replaces the per-item N+1 query.
  const priceMap = new Map<string, number>();
  if (variantIds.length > 0) {
    const variantPriceRows = await db.select().from(product_prices)
      .where(and(inArray(product_prices.variant_id, variantIds), eq(product_prices.currency, currency)));
    for (const p of variantPriceRows) priceMap.set(`v:${p.variant_id}`, p.price_net);
  }
  if (productIds.length > 0) {
    const productPriceRows = await db.select().from(product_prices)
      .where(and(inArray(product_prices.product_id, productIds), eq(product_prices.currency, currency)));
    for (const p of productPriceRows) {
      // Product-level price = row where variant_id is null.
      if (p.variant_id === null) priceMap.set(`p:${p.product_id}`, p.price_net);
    }
  }

  const result: EnrichedCartItem[] = [];
  for (const item of items) {
    let priceNet = 0;
    if (item.variant_id) {
      priceNet = priceMap.get(`v:${item.variant_id}`) ?? 0;
    } else if (item.product_id) {
      priceNet = priceMap.get(`p:${item.product_id}`) ?? 0;
    }

    const product = productMap.get(item.product_id);
    const variant = item.variant_id ? variantMap.get(item.variant_id) : null;

    result.push({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: product?.name ?? 'Unknown',
      sku: variant?.sku ?? product?.sku ?? null,
      quantity: item.quantity,
      price_net: priceNet,
      vat_rate: product?.vat_rate ?? null,
      currency,
      attributes: variantAttributesMap.get(item.variant_id) || [],
    });
  }
  return result;
}

export class CartItemError extends Error {
  code: 'not_found' | 'out_of_stock' | 'insufficient_stock' | 'variant_required' | 'product_not_found';
  constructor(message: string, code: 'not_found' | 'out_of_stock' | 'insufficient_stock' | 'variant_required' | 'product_not_found' = 'not_found') {
    super(message);
    this.code = code;
  }
}

/** Add an item to a cart (or increment if same product/variant already present). */
export async function addCartItem(
  db: LibSQLDatabase,
  cartId: string,
  input: { product_id: string; variant_id?: string | null; quantity: number },
): Promise<{ id: string; quantity: number }> {
  const [product] = await db.select().from(products).where(eq(products.id, input.product_id));
  if (!product) throw new CartItemError('Product not found', 'product_not_found');
  if (!product.active) throw new CartItemError('Product not available', 'product_not_found');

  let availableStock: number | null = null;
  if (input.variant_id) {
    const [variant] = await db
      .select()
      .from(product_variants)
      .where(and(eq(product_variants.id, input.variant_id), eq(product_variants.product_id, input.product_id)));
    if (!variant) throw new CartItemError('Variant not found', 'not_found');
    if (!variant.active) throw new CartItemError('Variant not available', 'not_found');
    availableStock = variant.stock;
  } else {
    // has_variants is derived from actual variant rows, NOT the DB column (which
    // is a vestige). If the product has any variant row, a variant_id is required.
    const [anyVariant] = await db
      .select()
      .from(product_variants)
      .where(eq(product_variants.product_id, input.product_id))
      .limit(1);
    if (anyVariant) {
      throw new CartItemError('variant_id is required for this product', 'variant_required');
    }
    availableStock = product.stock;
  }

  // Check for existing item with same product/variant
  const existing = await db
    .select()
    .from(cart_items)
    .where(eq(cart_items.cart_id, cartId));
  const existingItem = existing.find(i =>
    i.product_id === input.product_id &&
    ((i.variant_id === input.variant_id) || (i.variant_id === null && !input.variant_id)),
  );
  const existingQty = existingItem ? existingItem.quantity : 0;

  if (availableStock !== null) {
    if (availableStock <= 0) throw new CartItemError('Out of stock', 'out_of_stock');
    const totalRequested = existingQty + input.quantity;
    if (totalRequested > availableStock) throw new CartItemError('Insufficient stock', 'insufficient_stock');
  }

  if (existingItem) {
    await db.update(cart_items).set({ quantity: existingQty + input.quantity }).where(eq(cart_items.id, existingItem.id));
    return { id: existingItem.id, quantity: existingQty + input.quantity };
  }

  const id = crypto.randomUUID();
  await db.insert(cart_items).values({
    id,
    cart_id: cartId,
    product_id: input.product_id,
    variant_id: input.variant_id || null,
    quantity: input.quantity,
  });
  return { id, quantity: input.quantity };
}

/** Update a cart item's quantity (0 = remove). */
export async function updateCartItem(
  db: LibSQLDatabase,
  cartId: string,
  itemId: string,
  quantity: number,
): Promise<{ removed: boolean }> {
  const items = await db.select().from(cart_items).where(eq(cart_items.id, itemId));
  const item = items.find(i => i.cart_id === cartId);
  if (!item) throw new CartItemError('Cart item not found', 'not_found');

  if (quantity === 0) {
    await db.delete(cart_items).where(eq(cart_items.id, itemId));
    return { removed: true };
  }
  await db.update(cart_items).set({ quantity }).where(eq(cart_items.id, itemId));
  return { removed: false };
}

/** Delete a cart item. */
export async function deleteCartItem(
  db: LibSQLDatabase,
  cartId: string,
  itemId: string,
): Promise<void> {
  const items = await db.select().from(cart_items).where(eq(cart_items.id, itemId));
  const item = items.find(i => i.cart_id === cartId);
  if (!item) throw new CartItemError('Cart item not found', 'not_found');
  await db.delete(cart_items).where(eq(cart_items.id, itemId));
}

/** Clear all items from a cart. */
export async function clearCart(db: LibSQLDatabase, cartId: string): Promise<void> {
  await db.delete(cart_items).where(eq(cart_items.cart_id, cartId));
}

/** Set or remove the applied voucher code on a cart. */
export async function setCartVoucher(db: LibSQLDatabase, cartId: string, code: string | null): Promise<void> {
  await db.update(carts).set({ applied_voucher_code: code }).where(eq(carts.id, cartId));
}

/** Set or remove the applied referral code on a cart. */
export async function setCartReferral(db: LibSQLDatabase, cartId: string, code: string | null): Promise<void> {
  await db.update(carts).set({ applied_referral_code: code }).where(eq(carts.id, cartId));
}

/** List all carts ordered by updated_at DESC, with optional filters. */
export async function listCarts(
  db: LibSQLDatabase,
  opts: { abandonedSinceHours?: number; userId?: string },
): Promise<CartRow[]>;
export async function listCarts(
  db: LibSQLDatabase,
  opts: { abandonedSinceHours?: number; userId?: string; page: number; limit: number },
): Promise<{ rows: CartRow[]; total: number; page: number; limit: number }>;
export async function listCarts(
  db: LibSQLDatabase,
  opts: { abandonedSinceHours?: number; userId?: string; page?: number; limit?: number } = {},
): Promise<CartRow[] | { rows: CartRow[]; total: number; page: number; limit: number }> {
  // r17 Task 9 (list-accessors-sql): push WHERE/ORDER to SQL always; push
  // LIMIT/OFFSET + COUNT(*) when pagination args are present. No-arg/array shape
  // preserved for the admin list API endpoint backward compatibility.
  const conditions: any[] = [];
  if (opts.userId) conditions.push(eq(carts.user_id, opts.userId));
  if (opts.abandonedSinceHours) {
    const cutoff = new Date(Date.now() - opts.abandonedSinceHours * 60 * 60 * 1000);
    conditions.push(lt(carts.updated_at, cutoff));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  if (opts.page === undefined && opts.limit === undefined) {
    const rows = await db.select().from(carts).where(where).orderBy(desc(carts.updated_at));
    return rows as CartRow[];
  }
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const [countRow] = await db.select({ value: count() }).from(carts).where(where);
  const total = countRow?.value ?? 0;
  const paged = await db.select().from(carts)
    .where(where)
    .orderBy(desc(carts.updated_at))
    .limit(limit)
    .offset((page - 1) * limit);
  return { rows: paged as CartRow[], total, page, limit };
}

/** Get item count and total quantity for a cart. */
export async function getCartItemCount(db: LibSQLDatabase, cartId: string): Promise<{ item_count: number; total_quantity: number }> {
  const items = await db.select().from(cart_items).where(eq(cart_items.cart_id, cartId));
  return {
    item_count: items.length,
    total_quantity: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

export class StockValidationError extends Error {
  code: 'product_unavailable' | 'insufficient_stock';
  product_id: string;
  variant_id: string | null;
  constructor(message: string, code: 'product_unavailable' | 'insufficient_stock', productId: string, variantId: string | null = null) {
    super(message);
    this.code = code;
    this.product_id = productId;
    this.variant_id = variantId;
  }
}

/** Validate that all items in a cart have sufficient stock. Throws on failure. */
export async function validateCartStock(db: LibSQLDatabase, items: EnrichedCartItem[]): Promise<void> {
  for (const item of items) {
    const [product] = await db.select().from(products).where(eq(products.id, item.product_id));
    if (!product || !product.active) {
      throw new StockValidationError('Product no longer available', 'product_unavailable', item.product_id, item.variant_id);
    }
    let availableStock: number | null = product.stock;
    if (item.variant_id) {
      const [variant] = await db.select().from(product_variants).where(eq(product_variants.id, item.variant_id));
      if (variant) availableStock = variant.stock;
    }
    if (availableStock !== null && item.quantity > availableStock) {
      throw new StockValidationError('Insufficient stock', 'insufficient_stock', item.product_id, item.variant_id);
    }
  }
}
