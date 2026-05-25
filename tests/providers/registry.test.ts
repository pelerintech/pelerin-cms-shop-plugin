import { describe, it } from 'node:test';
import assert from 'node:assert';

// These imports will fail until the modules are created
import { registerProvider, getProvider } from '../../src/providers/payment/registry.ts';
import type { PaymentProvider } from '../../src/providers/payment/interface.ts';

const mockStripe: PaymentProvider = {
  name: 'stripe',
  refundable: true,
  initiatePayment: async () => ({ redirect_url: '', provider_session_id: '' }),
  handleWebhook: async () => ({ order_id: '', status: 'paid' }),
};

const mockEuplatesc: PaymentProvider = {
  name: 'euplatesc',
  refundable: true,
  initiatePayment: async () => ({ redirect_url: '', provider_session_id: '' }),
  handleWebhook: async () => ({ order_id: '', status: 'paid' }),
};

describe('Payment provider registry', () => {
  it('registerProvider adds a provider', () => {
    registerProvider(mockStripe);
    // Should not throw
  });

  it('getProvider returns registered provider', () => {
    registerProvider(mockStripe);
    const result = getProvider('stripe');
    assert.ok(result);
    assert.equal(result.name, 'stripe');
  });

  it('getProvider returns null for unknown provider', () => {
    const result = getProvider('unknown_provider');
    assert.equal(result, null);
  });

  it('supports multiple providers', () => {
    registerProvider(mockStripe);
    registerProvider(mockEuplatesc);
    assert.ok(getProvider('stripe'));
    assert.ok(getProvider('euplatesc'));
  });
});
