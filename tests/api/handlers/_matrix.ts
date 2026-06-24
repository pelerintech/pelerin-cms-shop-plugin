/**
 * Shared test-matrix helpers for API handler unit tests.
 *
 * Each handler method gets a matrix of: auth-fail (admin), validation-fail
 * (body-accepting), happy-path, error-wrap. These helpers build the common
 * cases so individual handler test files stay small and consistent.
 *
 * Usage:
 *   import { matrix } from '../_matrix.ts';
 *   matrix.adminAuthFail({ run: runGet, method: 'GET' });
 *   matrix.happyPath({ run: runGet, url: '...', expectedStatus: 200, check: b => assert.ok(Array.isArray(b.data)) });
 */
import assert from 'node:assert';
import {
  makeFakeSdk,
  makeCtx,
  poisonDb,
  unauthorizedError,
} from '../helpers.ts';
import { createTestDb, seedMinimal } from '../../db/harness.ts';

export interface RunFn {
  (deps: { db: any; sdk: any; ctx: any }): Promise<Response>;
}

async function body(res: Response): Promise<any> {
  return res.json();
}

export const matrix = {
  /** Admin endpoint: requireAdmin throws 401, poison db → 401 + success:false. */
  async adminAuthFail(opts: { run: RunFn; url?: string; body?: any }) {
    const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
    const ctx = makeCtx({ url: opts.url ?? 'http://localhost/api', body: opts.body });
    const res = await opts.run({ db: poisonDb(), sdk, ctx });
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
    const b = await body(res);
    assert.equal(b.success, false);
  },

  /** Body-accepting method: invalid body → 422 with non-empty fields. */
  async validationFail(opts: { run: RunFn; url?: string; invalidBody: any }) {
    const { db, cleanup } = await createTestDb();
    try {
      const sdk = makeFakeSdk();
      const ctx = makeCtx({ url: opts.url ?? 'http://localhost/api', body: opts.invalidBody });
      const res = await opts.run({ db, sdk, ctx });
      assert.equal(res.status, 422, `expected 422, got ${res.status}`);
      const b = await body(res);
      assert.equal(b.success, false);
      assert.equal(b.error, 'Validation failed');
      assert.ok(b.fields && Object.keys(b.fields).length > 0, 'fields should be non-empty');
    } finally {
      await cleanup();
    }
  },

  /** Happy path: seeded db + valid request → expectedStatus + success:true. */
  async happyPath(opts: {
    run: RunFn;
    url?: string;
    body?: any;
    params?: Record<string, string>;
    method?: string;
    expectedStatus?: number;
    seed?: boolean;
    check?: (b: any) => void;
  }) {
    const { db, cleanup } = await createTestDb();
    try {
      if (opts.seed !== false) await seedMinimal(db);
      const sdk = makeFakeSdk();
      const ctx = makeCtx({
        url: opts.url ?? 'http://localhost/api',
        body: opts.body,
        params: opts.params,
        method: opts.method,
      });
      const res = await opts.run({ db, sdk, ctx });
      assert.equal(res.status, opts.expectedStatus ?? 200, `expected ${opts.expectedStatus ?? 200}, got ${res.status}`);
      const b = await body(res);
      assert.equal(b.success, true);
      if (opts.check) opts.check(b);
    } finally {
      await cleanup();
    }
  },

  /** Error-wrap: poison db, auth passes, valid request → 500 + success:false. */
  async errorWrap(opts: { run: RunFn; url?: string; body?: any; params?: Record<string, string>; method?: string }) {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: opts.url ?? 'http://localhost/api',
      body: opts.body,
      params: opts.params,
      method: opts.method,
    });
    const res = await opts.run({ db: poisonDb(), sdk, ctx });
    assert.equal(res.status, 500, `expected 500, got ${res.status}`);
    const b = await body(res);
    assert.equal(b.success, false);
  },
};

export { createTestDb, seedMinimal, makeFakeSdk, makeCtx, poisonDb, unauthorizedError, assert };
