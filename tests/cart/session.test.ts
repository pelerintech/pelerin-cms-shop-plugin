import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSION_PATH = resolve(__dirname, '../../src/lib/cart-session.ts');

test('cart-session.ts exists', () => {
  assert.ok(existsSync(SESSION_PATH), 'src/lib/cart-session.ts should exist');
});

test('exports getOrCreateCart function', () => {
  const content = readFileSync(SESSION_PATH, 'utf-8');
  assert.match(content, /export\s+(async\s+)?function\s+getOrCreateCart/, 'Should export getOrCreateCart');
});

test('reads pelerin_shop_cart cookie from request headers', () => {
  const content = readFileSync(SESSION_PATH, 'utf-8');
  assert.match(content, /pelerin_shop_cart/, 'Should read pelerin_shop_cart cookie');
  assert.match(content, /cookie/i, 'Should parse cookies from request');
});

test('looks up existing cart by session_id in DB', () => {
  const content = readFileSync(SESSION_PATH, 'utf-8');
  assert.match(content, /session_id/, 'Should query carts by session_id');
  assert.match(content, /carts/, 'Should reference carts table');
});

test('checks cart expiry', () => {
  const content = readFileSync(SESSION_PATH, 'utf-8');
  assert.match(content, /expires_at/, 'Should check expires_at');
  assert.match(content, /new Date\(\)/, 'Should compare with current date');
});

test('creates new cart when no session cookie', () => {
  const content = readFileSync(SESSION_PATH, 'utf-8');
  assert.match(content, /randomUUID/, 'Should generate session ID with crypto.randomUUID()');
  assert.match(content, /insert.*carts/, 'Should insert into carts table');
  assert.match(content, /Set-Cookie/, 'Should return Set-Cookie header');
});

test('sets cookie with correct security flags', () => {
  const content = readFileSync(SESSION_PATH, 'utf-8');
  assert.match(content, /HttpOnly/, 'Cookie should be HttpOnly');
  assert.match(content, /SameSite=Lax/, 'Cookie should be SameSite=Lax');
  assert.match(content, /Max-Age/, 'Cookie should have Max-Age for expiry');
});
