/**
 * Shared types for the API handler injection seam.
 *
 * Every refactored handler exports a `runMethod({ db, sdk, ctx })` function
 * that receives these injected deps. The thin `export const METHOD: APIRoute`
 * wrapper constructs the deps from the real `astro:db` / `pelerin:plugin-sdk`
 * modules (the integration seam, not unit-tested); the `runMethod` function is
 * unit-tested with a fake `sdk`, a fake `ctx`, and either a seeded harness `db`
 * or a poison-db proxy.
 *
 * `db`, `sdk`, and `ctx` are typed via the `lib/types` boundary aliases (Db/Sdk/Ctx): importing the real types from
 * `pelerin:plugin-sdk` or `astro` would reintroduce the virtual-module dependency into the tested code path.
 * Type safety is provided by the handler's own usage; test correctness is verified by behavior, not types.
 */
import type { Db, Sdk, Ctx } from './types.ts';

export interface HandlerDeps {
  db: Db;
  sdk: Sdk;
  ctx: Ctx;
}
