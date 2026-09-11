import type { AnyRow } from './types.ts';

/**
 * Canonical public base URL of the CMS, used to build externally-consumed
 * callback/redirect URLs (e.g. the euPlatesc IPN `silenturl`).
 *
 * Sourced from `BETTER_AUTH_URL`, which is guaranteed to equal the delivery URL
 * (auth breaks otherwise), so it cannot drift. Falls back to `http://localhost:3000`
 * to keep dev/unit tests working. Always returned without a trailing slash.
 */
export function getPublicBaseUrl(): string {
  const raw = (import.meta as AnyRow).env?.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL;
  const base = raw || 'http://localhost:3000';
  return base.replace(/\/+$/, '');
}
