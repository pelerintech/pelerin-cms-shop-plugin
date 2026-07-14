import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, seedMinimal } from '../db/harness.ts';
import { carts } from '../../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { getOrCreateCart } from '../../src/lib/cart-session.ts';
import { makeFakeSdk } from '../api/helpers.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSION_PATH = resolve(__dirname, '../../src/lib/cart-session.ts');

test('cart-session.ts does NOT import from astro:db', () => {
  const content = readFileSync(SESSION_PATH, 'utf-8');
  assert.doesNotMatch(
    content,
    /from\s+['"]astro:db['"]/,
    'cart-session.ts must not import from astro:db — db is injected'
  );
});

test('cart-session.ts does NOT call createPluginContext', () => {
  const content = readFileSync(SESSION_PATH, 'utf-8');
  assert.doesNotMatch(
    content,
    /createPluginContext/,
    'cart-session.ts must not call createPluginContext — sdk is injected'
  );
});

test('getOrCreateCart(db, sdk, request) creates a guest cart and returns Set-Cookie when no cookie', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk({ user: null }); // guest
    const request = new Request('http://localhost/api/cart', { method: 'GET' });

    // signature: getOrCreateCart(db, sdk, request) — db + sdk injected
    const result = await getOrCreateCart(db, sdk, request);

    assert.ok(result.cart, 'should return a cart');
    assert.ok(result.sessionId, 'should return a session id');
    assert.ok(result.setCookie, 'should return a Set-Cookie header for a new cart');
    assert.match(result.setCookie, /pelerin_shop_cart=/);
    assert.match(result.setCookie, /HttpOnly/);

    // Cart should exist in db with the session id
    const [row] = await db.select().from(carts).where(eq(carts.session_id, result.sessionId));
    assert.ok(row, 'cart row should be persisted');
    assert.equal(row.user_id, null, 'guest cart should have no user_id');
  } finally {
    await cleanup();
  }
});

test('getOrCreateCart(db, sdk, request) returns existing cart by session cookie without Set-Cookie', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // First call creates a cart + session
    const sdk = makeFakeSdk({ user: null });
    const req1 = new Request('http://localhost/api/cart', { method: 'GET' });
    const first = await getOrCreateCart(db, sdk, req1);

    // Second call with the cookie returns the same cart, no Set-Cookie
    const req2 = new Request('http://localhost/api/cart', {
      method: 'GET',
      headers: { cookie: `pelerin_shop_cart=${first.sessionId}` },
    });
    const second = await getOrCreateCart(db, sdk, req2);

    assert.equal(second.cart.id, first.cart.id, 'should return the same cart');
    assert.equal(second.setCookie, null, 'should not set a new cookie for existing session');
  } finally {
    await cleanup();
  }
});

test('getOrCreateCart(db, sdk, request) links cart to user when sdk returns a user', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const userId = 'user-auth-1';
    const sdk = makeFakeSdk({ user: { id: userId, email: 'u@e.com' } });
    const request = new Request('http://localhost/api/cart', { method: 'GET' });

    const result = await getOrCreateCart(db, sdk, request);

    assert.ok(result.cart, 'should return a cart');
    assert.equal(result.cart.user_id, userId, 'cart should be linked to the authenticated user');
  } finally {
    await cleanup();
  }
});
