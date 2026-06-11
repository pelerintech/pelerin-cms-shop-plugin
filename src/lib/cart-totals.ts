export interface CartItemAttribute {
  attribute_name: string;
  attribute_type: string;
  role: string;
  value: string | number | boolean | null;
}

export interface CartItemLine {
  id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  price_net: number;
  vat_rate: number | null;
  vat_amount: number;
  price_gross: number;
  line_total_net: number;
  line_total_gross: number;
  currency: string;
  attributes: CartItemAttribute[];
}

export interface VatBreakdown {
  rate: number;
  base: number;
  amount: number;
}

export interface CartTotals {
  currency: string;
  items: CartItemLine[];
  subtotal_net: number;
  vat_breakdown: VatBreakdown[];
  vat_total: number;
  shipping_cost: number;
  discount_amount: number;
  total: number;
}

export interface CartItemInput {
  id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  price_net: number;
  vat_rate: number | null;
  currency: string;
  attributes: CartItemAttribute[];
}

/**
 * Compute cart totals from cart items with price data.
 * VAT is computed per item, then grouped by rate for the breakdown.
 * Prices are stored net; gross is computed from net * (1 + vat_rate).
 */
export function computeCartTotals(
  items: CartItemInput[],
  currency: string = 'RON',
  shippingCost: number = 0,
  discountAmount: number = 0
): CartTotals {
  const effectiveCurrency = currency;

  const itemLines: CartItemLine[] = items.map((item) => {
    const effectiveVatRate = item.vat_rate ?? 0;
    const priceNet = item.price_net;
    const priceGross = Math.round(priceNet * (1 + effectiveVatRate) * 100) / 100;
    const lineTotalNet = Math.round(priceNet * item.quantity * 100) / 100;
    const lineTotalGross = Math.round(priceGross * item.quantity * 100) / 100;
    const vatAmount = Math.round((lineTotalGross - lineTotalNet) * 100) / 100;

    return {
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name,
      sku: item.sku,
      quantity: item.quantity,
      price_net: priceNet,
      vat_rate: item.vat_rate,
      vat_amount: vatAmount,
      price_gross: priceGross,
      line_total_net: lineTotalNet,
      line_total_gross: lineTotalGross,
      currency: effectiveCurrency,
      attributes: item.attributes || [],
    };
  });

  // Subtotal — sum of all line totals (net)
  const subtotal_net = Math.round(
    itemLines.reduce((sum, line) => sum + line.line_total_net, 0) * 100
  ) / 100;

  // VAT breakdown grouped by rate
  const vatByRate = new Map<number, { base: number; amount: number }>();
  for (const line of itemLines) {
    const rate = line.vat_rate ?? 0;
    const existing = vatByRate.get(rate) || { base: 0, amount: 0 };
    existing.base += line.line_total_net;
    existing.amount += line.vat_amount;
    vatByRate.set(rate, existing);
  }

  const vat_breakdown: VatBreakdown[] = [];
  for (const [rate, data] of vatByRate) {
    vat_breakdown.push({
      rate,
      base: Math.round(data.base * 100) / 100,
      amount: Math.round(data.amount * 100) / 100,
    });
  }

  // Sort by rate ascending for consistent output
  vat_breakdown.sort((a, b) => a.rate - b.rate);

  const vat_total = Math.round(
    vat_breakdown.reduce((sum, b) => sum + b.amount, 0) * 100
  ) / 100;

  const total = Math.round(
    (subtotal_net + vat_total + shippingCost - discountAmount) * 100
  ) / 100;

  return {
    currency: effectiveCurrency,
    items: itemLines,
    subtotal_net,
    vat_breakdown,
    vat_total,
    shipping_cost: shippingCost,
    discount_amount: discountAmount,
    total,
  };
}