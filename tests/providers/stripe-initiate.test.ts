import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STRIPE_PATH = resolve(__dirname, '../../src/providers/payment/stripe.ts');

describe('Stripe adapter — initiate payment', () => {
  it('file exists', () => {
    assert.ok(existsSync(STRIPE_PATH), 'src/providers/payment/stripe.ts should exist');
  });

  it('exports initiatePayment function', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    // Either export async function or export { initiatePayment }
    assert.match(content, /initiatePayment/, 'Should export or define initiatePayment');
    assert.match(content, /export.*initiatePayment|async function initiatePayment/, 'Should have initiatePayment');
  });

  it('exports handleWebhook function', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    assert.match(content, /handleWebhook/, 'Should export or define handleWebhook');
    assert.match(content, /export.*handleWebhook|async function handleWebhook/, 'Should have handleWebhook');
  });

  it('implements PaymentProvider interface (name property)', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    assert.match(content, /name:\s*['"]stripe['"]/, 'Should have name: "stripe"');
  });

  it('creates Stripe checkout session', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    assert.match(content, /checkout\.sessions\.create|sessions\.create/, 'Should call Stripe checkout sessions create');
  });

  it('loads credentials via getSetting accessor', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    assert.match(content, /getSetting.*stripe_secret_key/, 'Should use getSetting accessor for stripe_secret_key');
  });

  it('builds line items from order', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    assert.match(content, /line_items|lineItems/, 'Should build line items');
  });

  it('sets success_url and cancel_url from options', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    assert.match(content, /success_url/, 'Should use success_url from options');
    assert.match(content, /cancel_url/, 'Should use cancel_url from options');
  });

  it('sets client_reference_id to order.id', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    assert.match(content, /client_reference_id|order\.id/, 'Should set client_reference_id to order.id');
  });

  it('returns redirect_url and provider_session_id', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    assert.match(content, /redirect_url/, 'Should return redirect_url');
    assert.match(content, /provider_session_id/, 'Should return provider_session_id');
  });

  it('transitions order to awaiting_payment', () => {
    const content = readFileSync(STRIPE_PATH, 'utf-8');
    assert.match(content, /awaiting_payment/, 'Should transition order to awaiting_payment');
  });
});