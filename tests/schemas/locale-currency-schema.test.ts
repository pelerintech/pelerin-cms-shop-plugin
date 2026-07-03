/**
 * Tier 3 tests for locale/currency Zod schemas.
 *
 * Validates that LocalesSchema and CurrenciesSchema enforce:
 * - code format (BCP-47 for locales, 3-letter ISO for currencies)
 * - name is non-empty string
 * - isDefault is boolean
 * - All codes unique within the array
 * - Exactly one isDefault: true
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { LocalesSchema, CurrenciesSchema } from '../../src/schemas/locales-currency.schema.ts';

// ----------------------------------------------------------------
// LocalesSchema — valid payloads
// ----------------------------------------------------------------

test('LocalesSchema accepts valid single locale with isDefault', () => {
  const result = LocalesSchema.safeParse([{ code: 'ro', name: 'Română', isDefault: true }]);
  assert.ok(result.success, 'should accept valid single locale');
});

test('LocalesSchema accepts multiple locales with exactly one default', () => {
  const result = LocalesSchema.safeParse([
    { code: 'ro', name: 'Română', isDefault: true },
    { code: 'en', name: 'English', isDefault: false },
    { code: 'bg', name: 'Български', isDefault: false },
  ]);
  assert.ok(result.success, 'should accept valid multi-locale array');
});

test('LocalesSchema accepts BCP-47 codes with subtag (e.g. en-US)', () => {
  const result = LocalesSchema.safeParse([
    { code: 'en-US', name: 'English (US)', isDefault: true },
  ]);
  assert.ok(result.success, 'should accept BCP-47 with subtag');
});

test('LocalesSchema accepts locale with 2-char code', () => {
  const result = LocalesSchema.safeParse([
    { code: 'fr', name: 'Français', isDefault: true },
  ]);
  assert.ok(result.success, 'should accept 2-char code');
});

// ----------------------------------------------------------------
// LocalesSchema — reject duplicate codes
// ----------------------------------------------------------------

test('LocalesSchema rejects duplicate codes', () => {
  const result = LocalesSchema.safeParse([
    { code: 'ro', name: 'Română', isDefault: true },
    { code: 'ro', name: 'Romanian', isDefault: false },
  ]);
  assert.ok(!result.success, 'should reject duplicate codes');
});

// ----------------------------------------------------------------
// LocalesSchema — reject no default
// ----------------------------------------------------------------

test('LocalesSchema rejects array with no default', () => {
  const result = LocalesSchema.safeParse([
    { code: 'ro', name: 'Română', isDefault: false },
    { code: 'en', name: 'English', isDefault: false },
  ]);
  assert.ok(!result.success, 'should reject no default');
});

test('LocalesSchema rejects empty array', () => {
  const result = LocalesSchema.safeParse([]);
  assert.ok(!result.success, 'should reject empty array');
});

// ----------------------------------------------------------------
// LocalesSchema — reject multiple defaults
// ----------------------------------------------------------------

test('LocalesSchema rejects multiple defaults', () => {
  const result = LocalesSchema.safeParse([
    { code: 'ro', name: 'Română', isDefault: true },
    { code: 'en', name: 'English', isDefault: true },
  ]);
  assert.ok(!result.success, 'should reject multiple defaults');
});

// ----------------------------------------------------------------
// LocalesSchema — reject invalid code format
// ----------------------------------------------------------------

test('LocalesSchema rejects invalid code format (uppercase)', () => {
  const result = LocalesSchema.safeParse([
    { code: 'Romanian', name: 'Română', isDefault: true },
  ]);
  assert.ok(!result.success, 'should reject invalid code format');
});

test('LocalesSchema rejects invalid code format (too short)', () => {
  const result = LocalesSchema.safeParse([
    { code: 'r', name: 'Română', isDefault: true },
  ]);
  assert.ok(!result.success, 'should reject code shorter than 2 chars');
});

test('LocalesSchema rejects invalid code format (with numbers)', () => {
  const result = LocalesSchema.safeParse([
    { code: 'r0', name: 'Română', isDefault: true },
  ]);
  assert.ok(!result.success, 'should reject codes with numbers');
});

// ----------------------------------------------------------------
// CurrenciesSchema — valid payloads
// ----------------------------------------------------------------

test('CurrenciesSchema accepts valid single currency', () => {
  const result = CurrenciesSchema.safeParse([{ code: 'RON', name: 'Leu românesc', isDefault: true }]);
  assert.ok(result.success, 'should accept valid single currency');
});

test('CurrenciesSchema accepts multiple currencies', () => {
  const result = CurrenciesSchema.safeParse([
    { code: 'RON', name: 'Leu românesc', isDefault: true },
    { code: 'EUR', name: 'Euro', isDefault: false },
    { code: 'USD', name: 'US Dollar', isDefault: false },
  ]);
  assert.ok(result.success, 'should accept valid multi-currency array');
});

// ----------------------------------------------------------------
// CurrenciesSchema — reject duplicate codes
// ----------------------------------------------------------------

test('CurrenciesSchema rejects duplicate codes', () => {
  const result = CurrenciesSchema.safeParse([
    { code: 'RON', name: 'Leu românesc', isDefault: true },
    { code: 'RON', name: 'Romanian Leu', isDefault: false },
  ]);
  assert.ok(!result.success, 'should reject duplicate currency codes');
});

// ----------------------------------------------------------------
// CurrenciesSchema — reject no default
// ----------------------------------------------------------------

test('CurrenciesSchema rejects array with no default', () => {
  const result = CurrenciesSchema.safeParse([
    { code: 'RON', name: 'Leu românesc', isDefault: false },
  ]);
  assert.ok(!result.success, 'should reject no default currency');
});

test('CurrenciesSchema rejects empty array', () => {
  const result = CurrenciesSchema.safeParse([]);
  assert.ok(!result.success, 'should reject empty currency array');
});

// ----------------------------------------------------------------
// CurrenciesSchema — reject multiple defaults
// ----------------------------------------------------------------

test('CurrenciesSchema rejects multiple defaults', () => {
  const result = CurrenciesSchema.safeParse([
    { code: 'RON', name: 'Leu românesc', isDefault: true },
    { code: 'EUR', name: 'Euro', isDefault: true },
  ]);
  assert.ok(!result.success, 'should reject multiple default currencies');
});

// ----------------------------------------------------------------
// CurrenciesSchema — reject invalid code format (not 3-letter ISO)
// ----------------------------------------------------------------

test('CurrenciesSchema rejects invalid code (too long)', () => {
  const result = CurrenciesSchema.safeParse([
    { code: 'RONIA', name: 'Leu românesc', isDefault: true },
  ]);
  assert.ok(!result.success, 'should reject code longer than 3 chars');
});

test('CurrenciesSchema rejects invalid code (too short)', () => {
  const result = CurrenciesSchema.safeParse([
    { code: 'RO', name: 'Romania', isDefault: true },
  ]);
  assert.ok(!result.success, 'should reject code shorter than 3 chars');
});

test('CurrenciesSchema rejects invalid code (with lowercase)', () => {
  const result = CurrenciesSchema.safeParse([
    { code: 'ron', name: 'Leu românesc', isDefault: true },
  ]);
  assert.ok(!result.success, 'should reject lowercase currency code');
});
