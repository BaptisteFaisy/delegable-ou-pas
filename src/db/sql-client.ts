/**
 * The only door to the database (SPEC §17, SPEC §19, DP-18).
 *
 * Every store of `src/db` receives a `SqlClient`; none of them ever imports a
 * Forge module. That is what makes the whole persistence layer testable
 * offline: the tests and the demo mode pass an in-memory client
 * (`src/db/memory-sql.ts`), production passes the Forge one.
 *
 * `@forge/sql` is referenced **only here**, and only through a lazy dynamic
 * import inside `createForgeSqlClient` / `createForgeDdlRunner`: importing a
 * store never pulls Forge in, so no test can touch the network.
 *
 * Forge SQL is MySQL-flavoured: positional `?` parameters bound with
 * `prepare(statement).bindParams(...).execute()`, which resolves to
 * `{ rows }` — an array for a SELECT, an update summary for a write. DDL goes
 * through `migrationRunner.enqueue(name, ddl).run()`, one idempotent step per
 * table (SPEC §19: one GiB per installation, so the schema stays small).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** The two calls a store may make: one bounded read, one write. */
export interface SqlClient {
  /** Runs INSERT/UPDATE/DDL; resolves once the write is durable. */
  execute(statement: string, parameters?: readonly unknown[]): Promise<void>;
  /** Runs a SELECT and returns its rows; `[]` when nothing matches. */
  query<T>(statement: string, parameters?: readonly unknown[]): Promise<T[]>;
}

/** Applies the schema; replayable, because every statement is idempotent. */
export interface DdlRunner {
  ensureSchema(ddl: readonly string[]): Promise<void>;
}

/* ------------------------------------------------------------- Forge shape */

/** Structural view of one prepared Forge SQL statement. */
interface ForgeStatement {
  bindParams(...params: unknown[]): ForgeStatement;
  execute(): Promise<{ rows: unknown }>;
}

/** Structural view of the Forge SQL singleton (`sql.prepare`). */
interface ForgeSqlApi {
  prepare(statement: string): ForgeStatement;
}

/** Structural view of Forge's `migrationRunner`. */
interface ForgeMigrationRunner {
  enqueue(name: string, ddl: string): ForgeMigrationRunner;
  run(): Promise<unknown>;
}

interface ForgeSqlModule {
  readonly sql?: ForgeSqlApi;
  readonly default?: ForgeSqlApi;
  readonly migrationRunner?: ForgeMigrationRunner;
}

/** Kept as a plain string so no static import of Forge ever happens. */
const FORGE_SQL_MODULE = '@forge/sql';

let loaded: Promise<ForgeSqlModule> | null = null;

/** Loads `@forge/sql` once per warm runtime; the only Forge import of the lot. */
export function loadForgeSql(): Promise<ForgeSqlModule> {
  loaded ??= import(FORGE_SQL_MODULE).then((mod: unknown) => mod as ForgeSqlModule);
  return loaded;
}

function toRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

/**
 * Wraps a Forge-shaped `sql` object into the narrow `SqlClient` contract.
 *
 * `deps.sql` is `unknown` on purpose: the caller injects whatever speaks
 * `prepare/bindParams/execute`, so a test double needs no Forge at all.
 */
export function createSqlClient(deps: { readonly sql: unknown }): SqlClient {
  const api = deps.sql as ForgeSqlApi;
  return {
    async execute(statement: string, parameters: readonly unknown[] = []): Promise<void> {
      await api.prepare(statement).bindParams(...parameters).execute();
    },
    async query<Row>(statement: string, parameters: readonly unknown[] = []): Promise<Row[]> {
      const result = await api.prepare(statement).bindParams(...parameters).execute();
      return toRows<Row>(result.rows);
    },
  };
}

/** The production client: loads `@forge/sql` lazily, then wraps it. */
export async function createForgeSqlClient(): Promise<SqlClient> {
  const mod = await loadForgeSql();
  const sql = mod.sql ?? mod.default;
  if (!sql) {
    throw new Error("Forge SQL is unavailable: '@forge/sql' exports no `sql`.");
  }
  return createSqlClient({ sql });
}

/**
 * A `DdlRunner` that simply replays the statements through a `SqlClient`.
 * Used by the tests, the demo stub and any backend that accepts plain DDL.
 */
export function createDdlRunner(client: SqlClient): DdlRunner {
  return {
    async ensureSchema(ddl: readonly string[]): Promise<void> {
      for (const statement of ddl) {
        await client.execute(statement);
      }
    },
  };
}

/**
 * The production `DdlRunner`: Forge allows exactly one `migrationRunner`
 * chain, so every statement is enqueued on the shared instance, in order,
 * under a name derived from its table (SPEC §19).
 */
export async function createForgeDdlRunner(): Promise<DdlRunner> {
  const mod = await loadForgeSql();
  const runner = mod.migrationRunner;
  if (!runner) {
    throw new Error("Forge SQL is unavailable: '@forge/sql' exports no `migrationRunner`.");
  }
  return {
    async ensureSchema(ddl: readonly string[]): Promise<void> {
      let chain = runner;
      ddl.forEach((statement, index) => {
        chain = chain.enqueue(`delegable-ou-pas-schema-${index + 1}`, statement);
      });
      await chain.run();
    },
  };
}
