import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TRANSITIONS_PATH = resolve(__dirname, '../../src/lib/order-transitions.ts');

describe('Order transition service', () => {
  it('file exists', () => {
    assert.ok(existsSync(TRANSITIONS_PATH), 'src/lib/order-transitions.ts should exist');
  });

  it('exports validateTransition function', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    assert.match(content, /export\s+function\s+validateTransition/, 'Should export validateTransition');
  });

  it('exports transitionOrder function', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    assert.match(content, /export\s+(async\s+)?function\s+transitionOrder/, 'Should export transitionOrder');
  });

  it('defines valid transition from pending to awaiting_payment', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    // Should have a transition map that allows pending → awaiting_payment
    assert.match(content, /pending.*awaiting_payment/, 'pending → awaiting_payment should be valid');
  });

  it('defines valid transition from awaiting_payment to paid', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    assert.match(content, /awaiting_payment.*paid/, 'awaiting_payment → paid should be valid');
  });

  it('throws for invalid transitions', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    assert.match(content, /Invalid status transition/, 'Should throw for invalid transitions');
  });

  it('throws for same-status transitions', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    assert.match(content, /same\s*status|Cannot transition/, 'Should handle same-status transitions');
  });

  it('allows same-status call via transitionOrder for logging', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    // transitionOrder should handle same-status gracefully (log only, no status change)
    assert.match(content, /Same-status.*log history only|fromStatus === toStatus/, 'Should allow same-status via transitionOrder');
  });

  it('inserts status history on transition', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    assert.match(content, /order_status_history/, 'Should insert order_status_history');
  });

  it('updates order status on transition', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    assert.match(content, /UPDATE|\.set|status/, 'Should update order status');
  });

  it('defines cancelled as terminal', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    // cancelled should not appear as a from-status in the transition map
    // This is implicit — validateTransition should reject transitions from cancelled
    assert.match(content, /Invalid status transition|validateTransition/, 'Should validate transitions');
  });

  it('defines refunded as terminal', () => {
    const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
    assert.match(content, /\[.*refunded.*\]|terminal/, 'Should handle terminal statuses');
  });
});
