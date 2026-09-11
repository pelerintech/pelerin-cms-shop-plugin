/**
 * Unit tests for `src/lib/public-base-url.ts` — `getPublicBaseUrl()`.
 *
 * The shop plugin builds externally-consumed payment callback/redirect URLs
 * from a canonical public base URL sourced from `BETTER_AUTH_URL` (which is
 * guaranteed to equal the delivery URL since auth breaks otherwise), NOT from
 * the internal request origin (which the Astro node adapter derives as `http://`
 * behind a TLS-terminating proxy).
 *
 * These run under bare `node --test` — the helper reads env at call time, so
 * tests set `process.env.BETTER_AUTH_URL` before calling.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { getPublicBaseUrl } from '../../src/lib/public-base-url.ts';

test('resolves to BETTER_AUTH_URL', () => {
  process.env.BETTER_AUTH_URL = 'https://cms.geneticlab.ro';
  assert.equal(getPublicBaseUrl(), 'https://cms.geneticlab.ro');
});

test('strips a trailing slash', () => {
  process.env.BETTER_AUTH_URL = 'https://cms.geneticlab.ro/';
  assert.equal(getPublicBaseUrl(), 'https://cms.geneticlab.ro');
});

test('falls back to localhost when BETTER_AUTH_URL is unset', () => {
  delete process.env.BETTER_AUTH_URL;
  assert.equal(getPublicBaseUrl(), 'http://localhost:3000');
});
