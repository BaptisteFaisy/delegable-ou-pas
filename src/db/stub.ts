/**
 * Demo mode without Forge SQL (SPEC §13, SPEC §20; DP-20).
 *
 * The app must run — and be demonstrable — when the installation has no
 * database: the sample dataset of lot L9 is written through these stores, so
 * the demo shows the very same screens, with the very same reads, as
 * production. The engine behind it is `memory-sql.ts`, the one the tests use
 * too: one implementation, no duplicated dialect.
 *
 * Nothing here touches the network, and nothing here imports Forge.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { createMemorySql, type MemorySql } from './memory-sql.js';
import { DDL } from './schema.js';
import { createDdlRunner, type SqlClient } from './sql-client.js';
import { createStores, type Stores } from './stores.js';

/** The demo repository: an in-memory database and the stores on top of it. */
export interface StubRepository {
  /** The engine, so a caller can seed rows or inspect the tables. */
  readonly sql: MemorySql;
  /** The same `Stores` the production path returns. */
  readonly stores: Stores;
}

/**
 * A `SqlClient` backed by memory: the in-memory engine already speaks the
 * two calls of the contract, so it *is* the stub client.
 */
export function createStubSqlClient(): MemorySql & SqlClient {
  return createMemorySql();
}

/** Ensures the schema in memory, then assembles every store (SPEC §13). */
export async function createStubRepository(): Promise<StubRepository> {
  const sql = createMemorySql();
  await createDdlRunner(sql).ensureSchema(DDL);
  return { sql, stores: createStores(sql) };
}
