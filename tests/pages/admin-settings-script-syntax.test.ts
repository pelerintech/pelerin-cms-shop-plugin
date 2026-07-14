import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, '../../src/pages/admin/settings/general.astro');
// esbuild is a transitive dependency of Vite/Astro (the host provides it). It
// transforms TypeScript the same way the astro build strips types from the
// `<script>` tag, so it is the correct tool to validate the script's syntax.
const ESBUILD = join(__dirname, '../../node_modules/esbuild/bin/esbuild');

/**
 * Regression guard: the client `<script>` in the general settings page must be
 * syntactically valid. A duplicate `const` declaration (or any other
 * SyntaxError) disables the ENTIRE client script at parse time, rendering
 * locale/currency management and general settings save non-functional in the
 * browser.
 *
 * This test extracts all `<script>` blocks and transforms each with esbuild.
 */
describe('general.astro client <script> syntax', () => {
  it('transforms all script blocks with esbuild without syntax errors', () => {
    const source = readFileSync(PAGE_PATH, 'utf-8');

    const scriptMatches = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    assert.ok(scriptMatches.length > 0, 'expected at least one <script> block in general.astro');

    const tmpDir = mkdtempSync(join(tmpdir(), 'astro-script-check-'));
    let allPassed = true;
    let errorMessage = '';

    try {
      for (let i = 0; i < scriptMatches.length; i++) {
        const clientScript = scriptMatches[i][1];
        if (clientScript.trim().length === 0) continue;

        const tmpIn = join(tmpDir, 'client_' + i + '.ts');
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
        }

        if (exitCode !== 0) {
          allPassed = false;
          errorMessage = `client <script> block #${i + 1} in general.astro has a syntax error.\nesbuild output:\n${combined}`;
          break;
        }
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }

    assert.ok(
      allPassed,
      errorMessage ||
        'client <script> in general.astro has a syntax error — the entire client script is disabled at parse time.'
    );
  });
});
