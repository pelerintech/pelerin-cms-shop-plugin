import crypto from 'node:crypto';

/**
 * Compute the euPlatesc MAC (fp_hash) using HMAC-MD5 with a hex-decoded binary key.
 *
 * The MAC string is built by concatenating length-prefixed field values:
 * - Non-empty value: `String(value.length) + value` (e.g. "1.00" → "41.00")
 * - Empty/null/undefined: `"-"` (single dash)
 *
 * The key is hex-decoded to a binary Buffer before being used as the HMAC key.
 *
 * Returns lowercase hex digest. The caller uppercases if needed for the request.
 *
 * @param fields - Ordered array of field values (can include null/undefined for empty fields)
 * @param key - Hex-encoded merchant key (e.g. "AA4A81EE...")
 * @returns Lowercase hex HMAC-MD5 digest
 */
export function computeEuplatescHash(fields: (string | null | undefined)[], key: string): string {
  // Build MAC string: length-prefixed per field, dash for empty
  let macString = '';
  for (const value of fields) {
    const trimmed = value == null ? '' : String(value);
    if (trimmed.length === 0) {
      macString += '-';
    } else {
      macString += String(trimmed.length) + trimmed;
    }
  }

  // Hex-decode the key to binary
  const binKey = Buffer.from(key, 'hex');

  // Compute HMAC-MD5
  return crypto.createHmac('md5', binKey).update(macString, 'utf8').digest('hex');
}

// ── Field set builders ──

/** Parameters for initiate payment MAC */
export interface RequestMacParams {
  amount: string;
  curr: string;
  invoice_id: string;
  order_desc: string;
  merch_id: string;
  timestamp: string;
  nonce: string;
}

/** Parameters for response MAC (IPN callback) */
export interface ResponseMacParams {
  amount: string;
  curr: string;
  invoice_id: string;
  ep_id: string;
  merch_id: string;
  action: string;
  message: string;
  approval: string;
  timestamp: string;
  nonce: string;
  // Optional fields (included in MAC only if present)
  sec_status?: string;
  rrn?: string;
  mcard?: string;
  card_exp?: string;
  discount_amount?: string;
  card_type?: string;
  bin?: string;
  rate?: string;
  card_holder?: string;
  email?: string;
  rtype?: string;
  cce?: string;
  // NOTE: payment_channel is NOT included in MAC (not in PHP reference code)
  payment_channel?: string;
}

/** Parameters for refund WebService MAC */
export interface RefundMacParams {
  method: string;
  ukey: string;
  amount: string;
  reason: string;
  epid: string;
  timestamp: string;
  nonce: string;
}

/** Parameters for check_mid WebService MAC */
export interface CheckMidMacParams {
  method: string;
  mid: string;
  timestamp: string;
  nonce: string;
}

/**
 * Build the ordered field array for the request MAC (initiate payment).
 * Fields: amount, curr, invoice_id, order_desc, merch_id, timestamp, nonce
 */
export function buildRequestFields(params: RequestMacParams): string[] {
  return [
    params.amount,
    params.curr,
    params.invoice_id,
    params.order_desc,
    params.merch_id,
    params.timestamp,
    params.nonce,
  ];
}

/**
 * Build the ordered field array for the response MAC (IPN callback).
 * Base fields: amount, curr, invoice_id, ep_id, merch_id, action, message, approval, timestamp, nonce
 * Optional fields (after nonce, in documented order):
 *   sec_status, rrn, mcard, card_exp, discount_amount, card_type, bin, rate,
 *   card_holder, email, rtype, cce
 * NOTE: payment_channel is NOT included (not in PHP reference code)
 *
 * Each value is trimmed (matching PHP trim()).
 */
export function buildResponseFields(params: ResponseMacParams): string[] {
  const trim = (v: string | undefined): string => (v == null ? '' : String(v).trim());

  const base: string[] = [
    trim(params.amount),
    trim(params.curr),
    trim(params.invoice_id),
    trim(params.ep_id),
    trim(params.merch_id),
    trim(params.action),
    trim(params.message),
    trim(params.approval),
    trim(params.timestamp),
    trim(params.nonce),
  ];

  // Optional fields in documented order — only if present in the params
  const optionalKeys: (keyof Pick<
    ResponseMacParams,
    | 'sec_status'
    | 'rrn'
    | 'mcard'
    | 'card_exp'
    | 'discount_amount'
    | 'card_type'
    | 'bin'
    | 'rate'
    | 'card_holder'
    | 'email'
    | 'rtype'
    | 'cce'
  >)[] = [
    'sec_status',
    'rrn',
    'mcard',
    'card_exp',
    'discount_amount',
    'card_type',
    'bin',
    'rate',
    'card_holder',
    'email',
    'rtype',
    'cce',
  ];

  for (const key of optionalKeys) {
    if (params[key] !== undefined && params[key] !== null) {
      base.push(trim(params[key]));
    }
  }

  return base;
}

/**
 * Build the ordered field array for the refund WebService MAC.
 * Fields: method, ukey, amount, reason, epid, timestamp, nonce
 */
export function buildRefundFields(params: RefundMacParams): string[] {
  return [
    params.method,
    params.ukey,
    params.amount,
    params.reason,
    params.epid,
    params.timestamp,
    params.nonce,
  ];
}

/**
 * Build the ordered field array for the check_mid WebService MAC.
 * Fields: method, mid, timestamp, nonce
 */
export function buildCheckMidFields(params: CheckMidMacParams): string[] {
  return [params.method, params.mid, params.timestamp, params.nonce];
}
