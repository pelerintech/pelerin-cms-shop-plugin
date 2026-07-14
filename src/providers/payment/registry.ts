import type { PaymentProvider } from './interface';

const providers = new Map<string, PaymentProvider>();

/**
 * Register a payment provider. Called by each provider module on import.
 * Throws if a provider with the same name is already registered.
 */
export function registerProvider(provider: PaymentProvider): void {
  providers.set(provider.name, provider);
}

/**
 * Look up a payment provider by name. Returns null if not found.
 */
export function getProvider(name: string): PaymentProvider | null {
  return providers.get(name) ?? null;
}

/**
 * Return all registered providers as an array.
 */
export function listProviders(): PaymentProvider[] {
  return Array.from(providers.values());
}
