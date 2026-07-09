import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, '../../src/components/admin/RichTextEditor.astro');
const ESBUILD = join(__dirname, '../../node_modules/esbuild/bin/esbuild');

/**
 * Regression guard: the client `<script is:inline>` in RichTextEditor.astro must
 * be syntactically valid. This component renders multiple times on the same page
 * (e.g., product edit has 3 instances for default + other locales). A
 * redeclaration error (`let marked`, `const markdownEditors`) at the top level
 * of each inline script disables ALL scripts on the page at parse time,
 * rendering the entire edit form non-functional.
 *
 * The fix wraps all declarations in an IIFE guarded by
 * `window.__rtEditorInitialized` so only the first instance initializes.
 *
 * This test extracts the inline script and transforms it with esbuild to catch
 * any future syntax errors or redeclarations that would break the component.
 */
describe('RichTextEditor.astro client <script is:inline> syntax', () => {
  it('transforms with esbuild without a syntax error', () => {
    const source = readFileSync(PAGE_PATH, 'utf-8');

    const scriptMatches = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    assert.ok(scriptMatches.length > 0, 'expected at least one <script> block in RichTextEditor.astro');

    const clientScript = scriptMatches[scriptMatches.length - 1][1];
    assert.ok(clientScript.trim().length > 0, 'extracted client script is empty');

    const tmpDir = mkdtempSync(join(tmpdir(), 'astro-richtext-check-'));
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
      `client <script> in RichTextEditor.astro has a syntax error — the entire editor is disabled at parse time.\nesbuild output:\n${combined}`,
    );
  });

  it('uses IIFE guard to prevent redeclaration across multiple instances', () => {
    const source = readFileSync(PAGE_PATH, 'utf-8');

    // Must contain the IIFE guard pattern
    assert.ok(
      source.includes('window.__rtEditorInitialized'),
      'RichTextEditor.astro must use window.__rtEditorInitialized guard to prevent redeclaration',
    );

    // Must NOT have top-level `let marked` outside the IIFE (would cause redeclaration)
    const scriptMatch = source.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi);
    assert.ok(scriptMatch, 'expected a <script> block');
    const scriptContent = scriptMatch[0];

    // The `let marked` should only appear inside the IIFE, not at the top level
    // After the opening <script>, the first meaningful statement should be the IIFE
    const trimmed = scriptContent.replace(/<script(?:\s[^>]*)?>/, '').replace(/<\/script>/, '').trim();
    assert.ok(
      trimmed.startsWith('//') || trimmed.startsWith('(function'),
      'RichTextEditor.astro script should start with comment or IIFE, not top-level declarations',
    );
  });
});
