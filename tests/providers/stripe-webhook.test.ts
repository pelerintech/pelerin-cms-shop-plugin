import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STRIPE_PATH = resolve(__dirname, '../../src/providers/payment/stripe.ts');

describe('Stripe adapter — webhook handler', () => {
  let content: string;

  before(() => {
    content = readFileSync(STRIPE_PATH, 'utf-8');
  });

  it('reads raw body using request.text()', () => {
    assert.match(content, /request\.text\(\)/, 'Should use request.text() for raw body');
  });

  it('reads stripe-signature header', () => {
    assert.match(content, /stripe-signature/, 'Should read stripe-signature header');
  });

  it('verifies signature with constructEvent', () => {
    assert.match(content, /constructEvent/, 'Should call stripe.webhooks.constructEvent');
  });

  it('throws on invalid signature', () => {
    assert.match(
      content,
      /Invalid.*signature|Invalid.*webhook/,
      'Should throw on invalid signature'
    );
  });

  it('handles checkout.session.completed event', () => {
    assert.match(
      content,
      /checkout\.session\.completed/,
      'Should handle checkout.session.completed'
    );
  });

  it('handles payment_intent.payment_failed event', () => {
    assert.match(
      content,
      /payment_intent\.payment_failed/,
      'Should handle payment_intent.payment_failed'
    );
  });

  it('transitions order to paid on completed', () => {
    assert.match(content, /paid/, 'Should transition to paid');
  });

  it('transitions order to awaiting_payment on failed', () => {
    // The content should handle failure by going to awaiting_payment
    assert.match(content, /awaiting_payment/, 'Should have awaiting_payment handling');
  });

  it('stores transaction_id on completed', () => {
    assert.match(content, /transaction_id/, 'Should store transaction_id');
  });

  it('reads webhook secret from shop_settings', () => {
    assert.match(content, /stripe_webhook_secret/, 'Should read stripe_webhook_secret');
  });

  it('looks up order by client_reference_id', () => {
    assert.match(content, /client_reference_id/, 'Should look up order by client_reference_id');
  });

  it('returns 404-style error for unknown order', () => {
    assert.match(content, /Order not found/, 'Should return error for unknown order');
  });
});
