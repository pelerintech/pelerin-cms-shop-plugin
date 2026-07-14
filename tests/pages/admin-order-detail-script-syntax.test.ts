/**
 * Task 44 — Client script syntax guard for order detail page.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, '../../src/pages/admin/orders/[id].astro');
const ESBUILD = join(__dirname, '../../node_modules/esbuild/bin/esbuild');

describe('order [id].astro client <script> syntax', () => {
  it('transforms with esbuild without a syntax/duplicate-declaration error', () => {
    const source = readFileSync(PAGE_PATH, 'utf-8');

    const scriptMatches = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    assert.ok(scriptMatches.length > 0, 'expected at least one <script> block');

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
      `client <script> in [id].astro has a syntax error.\nesbuild output:\n${combined}`,
    );
  });
});
