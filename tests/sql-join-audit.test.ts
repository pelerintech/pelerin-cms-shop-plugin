import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

test('no sql.join or dbSql.join occurrences remain in src/', () => {
  let output = '';
  try {
    output = execSync('grep -rn "sql.join\\|dbSql.join" src/ || true', { encoding: 'utf-8' });
  } catch {
    // grep returns non-zero if no matches — that's what we want
  }
  const lines = output
    .trim()
    .split('\n')
    .filter((l) => l.length > 0);
  assert.strictEqual(
    lines.length,
    0,
    `sql.join/dbSql.join must not appear in src/ — found ${lines.length} occurrences:\n${output}`
  );
});
