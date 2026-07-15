import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, '../../src/pages/admin/products/[id].astro');
// esbuild is a transitive dependency of Vite/Astro (the host provides it). It
// transforms TypeScript the same way the astro build strips types from the
// `<script>` tag, so it is the correct tool to validate the script's syntax.
const ESBUILD = join(__dirname, '../../node_modules/esbuild/bin/esbuild');

/**
 * Regression guard: the client `<script>` in the product edit page must be
 * syntactically valid. A duplicate `const` declaration (or any other
 * SyntaxError) disables the ENTIRE client script at parse time, rendering every
 * bug fix (Manage Variants matrix, variant edit modal, custom-field inputs,
 * price inputs) non-functional in the browser — while the `readFileSync +
 * assert.match` page tests pass 19/19 against the broken file.
 *
 * This test extracts the client script and transforms it with esbuild (which
 * handles the TypeScript `as` casts / type annotations the same way the astro
 * build does, and reports duplicate-declaration / syntax errors with a non-zero
 * exit). It is the test that WOULD have caught the duplicate-`const roleSelect`
 * SyntaxError the re-evaluation (2026-06-24) found, satisfying the spec's
 * "covered by tests that would have caught them" requirement for the parse-time
 * failure class that readFileSync+regex cannot detect.
 */
describe('[id].astro client <script> syntax', () => {
  it('transforms with esbuild without a syntax/duplicate-declaration error', () => {
    const source = readFileSync(PAGE_PATH, 'utf-8');

    // Extract the LAST <script>...</script> block (the client logic script).
    const scriptMatches = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    assert.ok(scriptMatches.length > 0, 'expected at least one <script> block in [id].astro');

    const clientScript = scriptMatches[scriptMatches.length - 1][1];
    assert.ok(clientScript.trim().length > 0, 'extracted client script is empty');

    const tmpDir = mkdtempSync(join(tmpdir(), 'astro-script-check-'));
    const tmpIn = join(tmpDir, 'client.ts');
    writeFileSync(tmpIn, clientScript, 'utf-8');

    let exitCode = 0;
    let combined = '';
    try {
      // `--bundle=false` (default) just transforms; we don't need output, only
      // that it parses. esbuild exits non-zero on syntax errors.
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
      `client <script> in [id].astro has a syntax error — the entire client script is disabled at parse time.\nesbuild output:\n${combined}`
    );
  });
});
