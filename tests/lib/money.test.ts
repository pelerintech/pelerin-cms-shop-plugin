/**
 * Tests for src/lib/money.ts — the single money-unit conversion helper.
 *
 * The shop stores, computes, and serves all money in MINOR units (bani/cents,
 * integer). Major units appear only at human-facing boundaries (admin UI +
 * bulk import). This module is the ONE place major↔minor conversion lives.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { majorToMinor, minorToMajor } from '../../src/lib/money.ts';

test('majorToMinor converts major units to minor units', () => {
  assert.strictEqual(majorToMinor(1), 100);
  assert.strictEqual(majorToMinor('1.00'), 100);
  assert.strictEqual(majorToMinor(19.99), 1999);
});

test('majorToMinor returns a number (not a string)', () => {
  assert.strictEqual(typeof majorToMinor(1), 'number');
});

test('minorToMajor converts minor units to major units', () => {
  assert.strictEqual(minorToMajor(100), 1);
  assert.strictEqual(minorToMajor(1999), 19.99);
});

test('round-trip is lossless', () => {
  assert.strictEqual(minorToMajor(majorToMinor(19.99)), 19.99);
});
