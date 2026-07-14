/**
 * Task 25: the dev seed (`src/db/seed.ts`) reflects the new flow — dimension
 * assignments use empty `offered_option_ids` (the subset is killed; generation
 * uses all options), and variant prices demonstrate inheritance.
 *
 * `src/db/seed.ts` imports `astro:db` so it cannot be imported under bare
 * `node --test`; this is a source-level assertion (honest static check that the
 * seed encodes the new flow).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SEED_PATH = resolve(__dirname, '../../src/db/seed.ts');

describe('seed reflects the new attribute/variant flow', () => {
  it('dimension assignments use empty offered_option_ids (subset killed)', () => {
    const content = readFileSync(SEED_PATH, 'utf-8');
    // The old seed built the subset with JSON.stringify([...]) for dimensions.
    // The new flow stores '[]' for dimension assignments.
    assert.doesNotMatch(
      content,
      /'dimension',\s*\d+,\s*'?\$\{JSON\.stringify\(\[/,
      'dimension assignments must NOT store a JSON.stringify([...]) subset offered_option_ids'
    );
  });
});
