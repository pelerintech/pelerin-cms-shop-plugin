/**
 * Guard: every `<script is:inline>` in `src/` must be valid **plain browser
 * JavaScript** (no TypeScript-only syntax such as `: Type` annotations or
 * `as` casts).
 *
 * Why this exists (shop-r34): Astro emits `is:inline` scripts verbatim to the
 * browser with NO TypeScript stripping — that stripping only happens for
 * bundled `<script>` tags that pass through Vite/esbuild. Writing TS inside an
 * `is:inline` block (as was done in the attribute pages) produced
 * `Uncaught SyntaxError: missing = in const declaration`, silently disabling
 * the whole client script. The pre-existing esbuild guards were a FALSE-GREEN
 * for `is:inline`: they validated scripts as TypeScript (esbuild strips type
 * annotations), but the browser never strips them.
 *
 * The fix for the guard: parse each `is:inline` block as plain JavaScript by
 * writing it to a `.js` temp file and running esbuild with its default (JS)
 * loader. esbuild then rejects TS-only syntax like `const body: Record<...>`
 * with a syntax error, while valid plain JS passes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname, '../../src');
const ESBUILD = join(__dirname, '../../node_modules/esbuild/bin/esbuild');

/** Recursively list all files under a directory. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/** Collect every non-empty `<script is:inline>...</script>` block, tagged by file. */
function collectInlineBlocks(): { file: string; label: string; body: string }[] {
  const blocks: { file: string; label: string; body: string }[] = [];
  const matcher = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  for (const file of listFiles(SRC_ROOT)) {
    if (extname(file) !== '.astro') continue;
    const source = readFileSync(file, 'utf-8');
    for (const m of source.matchAll(matcher)) {
      const fullTag = m[0];
      if (!fullTag.includes('is:inline')) continue; // only is:inline blocks
      const body = m[1];
      if (body.trim().length === 0) continue;
      blocks.push({ file, label: `${relative(SRC_ROOT, file)} (is:inline)`, body });
    }
  }
  return blocks;
}

/** Run esbuild on content as a plain `.js` file; returns exit code + output. */
function esbuildAsJs(content: string): { exitCode: number; output: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'inline-js-check-'));
  try {
    const tmpIn = join(tmpDir, 'inline.js'); // .js => esbuild treats it as plain JS
    writeFileSync(tmpIn, content, 'utf-8');
    try {
      const out = execFileSync(ESBUILD, [tmpIn], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
      return { exitCode: 0, output: out };
    } catch (err: any) {
      return {
        exitCode: err.status ?? 1,
        output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
      };
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('every <script is:inline> in src/ must be valid plain browser JS', () => {
  it('rejects TypeScript-only syntax in an is:inline-style probe (regression net works)', () => {
    // A controlled fixture of the exact class that broke the attribute pages.
    const probe = `const body: Record<string, any> = {};\nconst n = parseInt(v as string) || 0;\n`;
    const { exitCode, output } = esbuildAsJs(probe);
    assert.notEqual(
      exitCode,
      0,
      'esbuild (.js) must REJECT TS annotations inside an is:inline script; got exit 0\n' + output
    );
  });

  it('parses every actual is:inline block in src/ as plain JS (no TS-only syntax)', () => {
    const blocks = collectInlineBlocks();
    // If this guard is a no-op (no is:inline blocks found), the test is useless.
    assert.ok(blocks.length > 0, 'expected at least one <script is:inline> block under src/');

    const failures: string[] = [];
    for (const block of blocks) {
      const { exitCode, output } = esbuildAsJs(block.body);
      if (exitCode !== 0) {
        failures.push(
          `${block.label} is not plain browser JS (it would throw a SyntaxError in the browser).\nesbuild output:\n${output}`
        );
      }
    }
    assert.deepEqual(
      failures,
      [],
      `The following is:inline scripts contain TypeScript-only syntax:\n${failures.join('\n\n')}`
    );
  });
});
