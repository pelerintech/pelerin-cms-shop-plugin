import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, '../../src/components/admin/ImageUpload.astro');
const ESBUILD = join(__dirname, '../../node_modules/esbuild/bin/esbuild');

/**
 * Regression guard (r18): the client `<script>` in ImageUpload.astro must be
 * syntactically valid. This component drives the real multipart upload to
 * POST .../images; a parse-time SyntaxError (duplicate const, unbalanced
 * braces) disables the whole upload flow in the browser while every
 * readFileSync+regex test still passes. esbuild transforms the extracted
 * script and exits non-zero on a syntax error — the only Tier 1–3 check that
 * catches parse-time breakage (the r15 lesson). Tier 4 E2E is the behavioral
 * backstop.
 */
describe('ImageUpload.astro client <script> syntax', () => {
  it('transforms with esbuild without a syntax error', () => {
    const source = readFileSync(PAGE_PATH, 'utf-8');

    const scriptMatches = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    assert.ok(scriptMatches.length > 0, 'expected at least one <script> block in ImageUpload.astro');

    const clientScript = scriptMatches[scriptMatches.length - 1][1];
    assert.ok(clientScript.trim().length > 0, 'extracted client script is empty');

    const tmpDir = mkdtempSync(join(tmpdir(), 'astro-imageupload-check-'));
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
      `client <script> in ImageUpload.astro has a syntax error — the upload flow is disabled at parse time.\nesbuild output:\n${combined}`,
    );
  });
});
