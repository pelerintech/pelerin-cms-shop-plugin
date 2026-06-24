import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, '../../src/pages/admin/import/index.astro');
// esbuild is a transitive dependency of Vite/Astro (the host provides it). It
// transforms the client `<script>` the same way the astro build strips types,
// so it is the correct tool to validate the script's syntax.
const ESBUILD = join(__dirname, '../../node_modules/esbuild/bin/esbuild');

/**
 * Regression guard: the client `<script>` in the import hub page must be
 * syntactically valid. A SyntaxError (duplicate `const`, unbalanced braces,
 * etc.) disables the ENTIRE client script at parse time — both upload forms,
 * the result rendering, and the file-type guards all stop working in the
 * browser, while the `readFileSync + assert.match` static structure test
 * (admin-import-ui.test.ts) still passes against the broken file.
 *
 * This test extracts the client script and transforms it with esbuild (which
 * reports syntax errors with a non-zero exit). It is the Tier 3 guard required
 * by AGENTS.md §14 for any admin `.astro` page with a client `<script>`, and
 * closes the evaluation gap (2026-06-24) that flagged the Admin UI capability
 * as PARTIAL for lacking this guard.
 */
describe('admin import hub page — client <script> syntax', () => {
  it('transforms with esbuild without a syntax/duplicate-declaration error', () => {
    const source = readFileSync(PAGE_PATH, 'utf-8');

    // Extract the LAST <script>...</script> block (the client logic script).
    const scriptMatches = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    assert.ok(scriptMatches.length > 0, 'expected at least one <script> block in import/index.astro');

    const clientScript = scriptMatches[scriptMatches.length - 1][1];
    assert.ok(clientScript.trim().length > 0, 'extracted client script is empty');

    const tmpDir = mkdtempSync(join(tmpdir(), 'astro-script-check-'));
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
      `client <script> in import/index.astro has a syntax error — the entire client script is disabled at parse time.\nesbuild output:\n${combined}`,
    );
  });
});
