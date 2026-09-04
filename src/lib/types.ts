/**
 * Central loose / `any` stand-ins for boundaries that lack a clean shared type
 * yet (r37). Each alias confines the `any` to one documented declaration (with
 * a targeted `eslint-disable`) so that usages read as a named type and
 * `@typescript-eslint/no-explicit-any` stays live everywhere else. Tighten
 * these one-by-one as real types become available.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { ResultSet } from '@libsql/client';

/** Opaque CMS plugin SDK handle (pelerin:plugin-sdk). */
export type Sdk = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Opaque CMS DB handle (pelerin plugin SDK db). */
export type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Opaque Astro request/context handle. */
export type Ctx = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Loose row/entity stand-in where the exact row type is impractical. */
export type AnyRow = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Loose object stand-in (dynamic update maps, response payloads). */
export type AnyRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Drizzle WHERE expression (eq / and / sql fragments). */
export type WhereCondition = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Loose body built up with dynamic keys before JSON serialization. */
export type LooseBody = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * DB surface shared by a full `LibSQLDatabase` and a Drizzle `SQLiteTransaction`
 * (the tx yielded by `db.transaction(async (tx) => …)`). Accessor functions that
 * are called from inside a transaction take this union so the same signature
 * accepts both the injected db and the tx. The two differ only by schema generic;
 * at runtime the tx has every non-`batch` method a full db has.
 */
export type AnyDb =
  | LibSQLDatabase
  | SQLiteTransaction<
      'async',
      ResultSet,
      Record<string, never>,
      ExtractTablesWithRelations<Record<string, never>>
    >;
