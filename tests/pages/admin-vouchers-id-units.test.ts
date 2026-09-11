import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAGE_PATH = resolve(__dirname, '../../src/pages/admin/vouchers/[id].astro');

describe('Vouchers [id] page - money-unit boundary (r40)', () => {
  it('loads stored fixed_amount value as major (/100); percentage stays a percent', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    // The /100 must be guarded by type === 'fixed_amount' (percentage values are
    // stored as a percent and must NOT be divided by 100).
    assert.match(
      content,
      /v\.type === 'fixed_amount'\s*\?\s*v\.value \/ 100\s*:\s*v\.value/,
      'value field must /100 only when fixed_amount'
    );
    assert.doesNotMatch(
      content,
      /v\.value !== null \? v\.value \/ 100 : ''/,
      'must not unconditionally /100 (would corrupt percentage to 0.1)'
    );
    assert.match(
      content,
      /form\.min_order_value\.value = v\.min_order_value !== null \? v\.min_order_value \/ 100 : ''/,
      'min_order_value field must display minor→major'
    );
  });

  it('sends the typed value back to the API in major units (no x100 client-side)', () => {
    const content = readFileSync(PAGE_PATH, 'utf-8');
    assert.doesNotMatch(
      content,
      /value:\s*[^,]*\*\s*100/,
      'must not multiply the typed value x100 client-side; the server handler converts'
    );
  });
});
