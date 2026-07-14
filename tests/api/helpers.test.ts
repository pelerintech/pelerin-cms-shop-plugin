import { test } from 'node:test';
import assert from 'node:assert';
import { makeFakeSdk, unauthorizedError, forbiddenError, makeCtx, poisonDb } from './helpers.ts';
import type { HandlerDeps } from '../../src/lib/handler-types.ts';

test('HandlerDeps interface is exported with db, sdk, ctx', () => {
  const deps: HandlerDeps = { db: {}, sdk: {}, ctx: {} };
  assert.ok(deps, 'HandlerDeps should be constructable');
  assert.equal(typeof deps, 'object');
});

test('makeFakeSdk({ authThrows: unauthorizedError() }) — requireAdmin throws with status 401', async () => {
  const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
  await assert.rejects(
    () => sdk.auth.requireAdmin({} as any),
    (err: any) => err.status === 401
  );
});

test('makeFakeSdk().auth.requireAdmin() resolves to a user object', async () => {
  const sdk = makeFakeSdk();
  const user = await sdk.auth.requireAdmin({} as any);
  assert.ok(user, 'requireAdmin should resolve to a truthy user');
  assert.equal(typeof user, 'object');
});

test('makeFakeSdk().auth.getUser() resolves to a user object', async () => {
  const sdk = makeFakeSdk();
  const user = await sdk.auth.getUser({} as any);
  assert.ok(user, 'getUser should resolve to a truthy user');
});

test('makeFakeSdk({ user: null }) — getUser resolves to null (guest)', async () => {
  const sdk = makeFakeSdk({ user: null });
  const user = await sdk.auth.getUser({} as any);
  assert.equal(user, null);
});

test('unauthorizedError() has status 401', () => {
  const err = unauthorizedError();
  assert.equal(err.status, 401);
  assert.ok(err.message);
});

test('forbiddenError() has status 403', () => {
  const err = forbiddenError();
  assert.equal(err.status, 403);
  assert.ok(err.message);
});

test('makeCtx({ url }) — request.url preserves query string', () => {
  const ctx = makeCtx({ url: 'http://x/y?a=1' });
  assert.ok(ctx.request.url.includes('a=1'), 'url should include the query string');
});

test('makeCtx({ body }) — request can be .json()-parsed', async () => {
  const ctx = makeCtx({ body: { x: 1 } });
  const parsed = await ctx.request.json();
  assert.deepEqual(parsed, { x: 1 });
});

test('makeCtx({ params }) — ctx.params holds the params', () => {
  const ctx = makeCtx({ params: { id: 'abc' } });
  assert.equal(ctx.params.id, 'abc');
});

test('makeCtx default method is GET', () => {
  const ctx = makeCtx({});
  assert.equal(ctx.request.method, 'GET');
});

test('poisonDb() — any property access / call throws', () => {
  const db = poisonDb();
  assert.throws(() => db.select(), /poison/i);
  assert.throws(() => db.select().from(), /poison/i);
  assert.throws(() => db.anything, /poison/i);
});
