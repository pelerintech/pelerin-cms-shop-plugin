/**
 * Node ESM loader hook for unit-testing API handlers outside the Astro build.
 *
 * It does two things:
 *  1. Resolves the `astro:db` and `pelerin:plugin-sdk` virtual modules to
 *     static stub modules (tests/stubs/*.mjs) so handler files import cleanly.
 *     The stubs are never exercised — handlers' `runMethod` functions receive
 *     `db`/`sdk` as injected deps, and the thin wrappers are never called.
 *  2. Adds `.ts` extension resolution for relative specifiers, mirroring
 *     Astro/Vite's behaviour, so the handler dependency graph (data accessors,
 *     schemas) resolves under bare Node.
 *
 * Registered via tests/stubs/register.mjs (module.register) from each handler
 * test file. This is a STATIC resolution shim — it does NOT provide fake db/sdk
 * behaviour and has no per-test mutable state (the design's stated reason for
 * rejecting module-load mocking). Fakes come from injection.
 */
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const astroDbUrl = pathToFileURL(pathResolve(__dirname, 'astro-db.mjs')).href;
const pluginSdkUrl = pathToFileURL(pathResolve(__dirname, 'plugin-sdk.mjs')).href;

const KNOWN_EXT = /\.(ts|tsx|mjs|js|jsx|cjs|json|node)$/i;
const isRelative = (s) => s.startsWith('.') || s.startsWith('/');

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'astro:db' || specifier.startsWith('astro:')) {
    return { url: astroDbUrl, shortCircuit: true };
  }
  if (specifier === 'pelerin:plugin-sdk' || specifier.startsWith('pelerin:')) {
    return { url: pluginSdkUrl, shortCircuit: true };
  }

  // For relative specifiers without a recognised module extension, append .ts
  // (mirrors Astro/Vite). e.g. './products' -> './products.ts',
  // './product.schema' -> './product.schema.ts' ('.schema' is not a module ext).
  if (isRelative(specifier) && !KNOWN_EXT.test(specifier)) {
    try {
      return await nextResolve(specifier + '.ts', context);
    } catch {
      // fall through to default resolve
    }
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    throw err;
  }
}
