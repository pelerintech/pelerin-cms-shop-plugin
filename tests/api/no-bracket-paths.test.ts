import { test } from 'node:test';
import assert from 'node:assert';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Guard against the silent-skip regression (reeval 2026-06-23):
// `node --test` treats `[`/`]` in a path as a glob character class, so a file
// named `tests/api/handlers/carts/[id].test.ts` is silently skipped (0 tests
// registered, 0 failures). This reintroduces the exact "false confidence"
// problem the r14 request exists to eliminate. No test file discovered under
// tests/api/handlers/ may contain `[` or `]` in its relative path.

const ROOT = 'tests/api/handlers';

function listTestFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listTestFiles(full, acc);
    } else if (entry.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

test('no handler test file path contains glob-bracket characters', () => {
  const files = listTestFiles(ROOT);
  assert.ok(files.length > 40, `expected many handler test files, found ${files.length}`);
  const bracketed = files.filter(
    (f) => relative('.', f).includes('[') || relative('.', f).includes(']')
  );
  assert.deepEqual(
    bracketed,
    [],
    `bracket paths silently skipped by node --test (glob char class):\n${bracketed.join('\n')}`
  );
});
