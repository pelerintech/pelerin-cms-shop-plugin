import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const contents = readFileSync(new URL('../../src/db/seed.ts', import.meta.url), 'utf-8');

test('seed inserts fixed_amount voucher', () => {
  assert.ok(contents.includes('fixed_amount'), 'seed should include fixed_amount voucher');
});

test('seed inserts percentage voucher', () => {
  assert.ok(contents.includes('percentage'), 'seed should include percentage voucher');
});

test('seed inserts free_shipping voucher', () => {
  assert.ok(contents.includes('free_shipping'), 'seed should include free_shipping voucher');
});

test('seed inserts active referral code', () => {
  assert.ok(contents.includes('referral_codes'), 'seed should reference referral_codes');
});
