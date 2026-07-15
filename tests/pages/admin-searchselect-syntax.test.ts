import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPONENT_PATH = join(__dirname, '../../src/components/admin/SearchSelect.astro');
const ESBUILD = join(__dirname, '../../node_modules/esbuild/bin/esbuild');

/**
 * Regression guard: the client `<script>` in SearchSelect.astro must be
 * syntactically valid. A duplicate `const` or any SyntaxError disables the
 * entire client script at parse time, rendering the type-ahead non-functional.
 */
test('SearchSelect.astro client <script> transforms with esbuild without syntax errors', () => {
  const source = readFileSync(COMPONENT_PATH, 'utf-8');

  // Extract the <script is:inline> block
  const scriptMatches = [...source.matchAll(/<script[^>]*is:inline[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(
    scriptMatches.length > 0,
    'expected at least one <script is:inline> block in SearchSelect.astro'
  );

  const clientScript = scriptMatches[0][1];
  assert.ok(clientScript.trim().length > 0, 'extracted client script is empty');

  const tmpDir = mkdtempSync(join(tmpdir(), 'searchselect-script-check-'));
  const tmpIn = join(tmpDir, 'client.ts');
  writeFileSync(tmpIn, clientScript, 'utf-8');

  let exitCode = 0;
  let combined = '';
  try {
    const out = execFileSync(ESBUILD, [tmpIn], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    combined = out;
  } catch (err: any) {
    exitCode = err.status ?? 1;
    combined = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  assert.equal(
    exitCode,
    0,
    `client <script> in SearchSelect.astro has a syntax error.\nesbuild output:\n${combined}`
  );
});
