import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeEuplatescHash,
  buildRequestFields,
  buildResponseFields,
  buildRefundFields,
  buildCheckMidFields,
} from '../../src/lib/euplatesc-mac.ts';

describe('euPlatesc MAC field set builders', () => {
  const key = '00112233445566778899AABBCCDDEEFF';

  // ── buildRequestFields ──

  it('buildRequestFields returns ordered array for initiate payment', () => {
    const fields = buildRequestFields({
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-001',
      order_desc: 'Order ORD-001',
      merch_id: '44841007584',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
    });

    assert.deepStrictEqual(fields, [
      '50.00',
      'RON',
      'ORD-001',
      'Order ORD-001',
      '44841007584',
      '20260710120000',
      'abcdef1234567890abcdef1234567890',
    ]);
  });

  // ── buildResponseFields ──

  it('buildResponseFields returns base fields in correct order', () => {
    const fields = buildResponseFields({
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-001',
      ep_id: 'EP123',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
    });

    assert.deepStrictEqual(fields, [
      '50.00',
      'RON',
      'ORD-001',
      'EP123',
      '44841007584',
      '0',
      'OK',
      'APPR123',
      '20260710120000',
      'abcdef1234567890abcdef1234567890',
    ]);
  });

  it('buildResponseFields includes optional fields when present', () => {
    const fields = buildResponseFields({
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-001',
      ep_id: 'EP123',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
      rrn: 'RRN123',
      email: 'customer@example.com',
      card_type: 'VISA',
    });

    // Base fields + optional fields in documented order after nonce
    // Optional order: sec_status, rrn, mcard, card_exp, discount_amount, card_type, bin, rate, card_holder, email, rtype, cce
    assert.deepStrictEqual(fields, [
      '50.00',
      'RON',
      'ORD-001',
      'EP123',
      '44841007584',
      '0',
      'OK',
      'APPR123',
      '20260710120000',
      'abcdef1234567890abcdef1234567890',
      'RRN123',
      'VISA',
      'customer@example.com',
    ]);
  });

  it('buildResponseFields does NOT include payment_channel', () => {
    const fields = buildResponseFields({
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-001',
      ep_id: 'EP123',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
      payment_channel: 'some_channel', // must NOT be included
      rrn: 'RRN123',
    });

    assert.ok(
      !fields.includes('some_channel'),
      'payment_channel must NOT be included in the MAC field set'
    );
    assert.ok(fields.includes('RRN123'), 'rrn must be included when present');
  });

  it('buildResponseFields trims values', () => {
    const fields = buildResponseFields({
      amount: ' 50.00 ',
      curr: ' RON ',
      invoice_id: ' ORD-001 ',
      ep_id: ' EP123 ',
      merch_id: ' 44841007584 ',
      action: ' 0 ',
      message: ' OK ',
      approval: ' APPR123 ',
      timestamp: ' 20260710120000 ',
      nonce: ' abcdef1234567890abcdef1234567890 ',
    });

    assert.deepStrictEqual(fields, [
      '50.00',
      'RON',
      'ORD-001',
      'EP123',
      '44841007584',
      '0',
      'OK',
      'APPR123',
      '20260710120000',
      'abcdef1234567890abcdef1234567890',
    ]);
  });

  // ── buildRefundFields ──

  it('buildRefundFields returns correct ordered array', () => {
    const fields = buildRefundFields({
      method: 'refund',
      ukey: 'UKEY123',
      amount: '50.00',
      reason: 'Product not in stock',
      epid: 'EP123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
    });

    assert.deepStrictEqual(fields, [
      'refund',
      'UKEY123',
      '50.00',
      'Product not in stock',
      'EP123',
      '20260710120000',
      'abcdef1234567890abcdef1234567890',
    ]);
  });

  // ── buildCheckMidFields ──

  it('buildCheckMidFields returns correct ordered array', () => {
    const fields = buildCheckMidFields({
      method: 'check_mid',
      mid: '44841007584',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
    });

    assert.deepStrictEqual(fields, [
      'check_mid',
      '44841007584',
      '20260710120000',
      'abcdef1234567890abcdef1234567890',
    ]);
  });

  // ── Integration: response MAC with optional fields ──

  it('response MAC with optional fields produces correct hash', () => {
    const params = {
      amount: '1.00',
      curr: 'RON',
      invoice_id: 'TEST-123',
      ep_id: 'EP999',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: '',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
      email: 'test@example.com',
    };

    const fields = buildResponseFields(params);
    const hash = computeEuplatescHash(fields, key);

    // Verify the hash is computed (non-empty, 32 hex chars)
    assert.strictEqual(hash.length, 32, 'Hash must be 32 hex characters');
    assert.match(hash, /^[0-9a-f]{32}$/, 'Hash must be lowercase hex');

    // Verify the fields array includes email at the end
    assert.strictEqual(
      fields[fields.length - 1],
      'test@example.com',
      'email must be the last field in the response MAC'
    );
  });

  it('response MAC without optional fields omits them', () => {
    const params = {
      amount: '1.00',
      curr: 'RON',
      invoice_id: 'TEST-123',
      ep_id: 'EP999',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: '',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
    };

    const fields = buildResponseFields(params);

    // Should be exactly 10 base fields, no optional fields
    assert.strictEqual(
      fields.length,
      10,
      'Response MAC should have exactly 10 base fields when no optional fields present'
    );
  });
});
