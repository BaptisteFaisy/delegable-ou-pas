/**
 * Entry point of the persistence layer (SPEC §17, SPEC §18, SPEC §19;
 * DP-13, DP-18, DP-19).
 *
 * `createRepository` is called once, by `src/deps.ts` (lot L7): it replays
 * the schema — every statement is `CREATE TABLE IF NOT EXISTS`, so a restart
 * costs nothing and never loses a row (SPEC §20 "rien ne se supprime") — then
 * hands back the assembled stores.
 *
 * Two paths, one contract: on Forge SQL the DDL goes through Forge's
 * migration runner and the statements through the Forge client; offline
 * (tests, demo) the same DDL and the same statements go through the
 * in-memory engine of `stub.ts`.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { DDL } from './schema.js';
import {
  createDdlRunner,
  createForgeDdlRunner,
  createForgeSqlClient,
  type SqlClient,
} from './sql-client.js';
import { createStores, type Stores } from './stores.js';

/** Ensures the schema on one client, then assembles every store. */
export async function createRepository(client: SqlClient): Promise<Stores> {
  await createDdlRunner(client).ensureSchema(DDL);
  return createStores(client);
}

/**
 * The production repository: the Forge client and the Forge migration runner
 * are both built by `sql-client.ts`, the only file of the lot that ever looks
 * at the Forge package.
 */
export async function createForgeRepository(): Promise<Stores> {
  const client = await createForgeSqlClient();
  await (await createForgeDdlRunner()).ensureSchema(DDL);
  return createStores(client);
}

/** The production client on its own, for a caller that already has stores. */
export { createForgeSqlClient };
