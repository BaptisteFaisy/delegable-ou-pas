/**
 * The in-memory SQL fake of this folder (SPEC §18, SPEC §19, DP-20).
 *
 * It is not a canned answer: it wraps the very engine the demo mode runs on
 * (`src/db/memory-sql.ts`), so a test here executes the real statements of
 * the stores — upserts on the natural key, bounded reads, aggregates — and
 * asserts on real rows. No network, no Forge, no clock.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { createMemorySql, type MemoryRow, type MemorySql } from '../../src/db/memory-sql.js';
import { DDL } from '../../src/db/schema.js';
import { createDdlRunner, type SqlClient } from '../../src/db/sql-client.js';

/** One statement the stores sent, kept for the assertions of the tests. */
export interface FakeSql extends SqlClient {
  /** The engine underneath: tables, rows, seeding. */
  readonly sql: MemorySql;
  /** Every statement received, in order. */
  readonly statements: string[];
  seed(table: string, rows: readonly MemoryRow[]): void;
  rowsOf(table: string): readonly MemoryRow[];
  rowCount(table: string): number;
  clear(): void;
}

function wrap(sql: MemorySql): FakeSql {
  return {
    sql,
    statements: sql.statements,
    query: <Row,>(statement: string, parameters?: readonly unknown[]): Promise<Row[]> =>
      sql.query<Row>(statement, parameters),
    execute: (statement: string, parameters?: readonly unknown[]): Promise<void> =>
      sql.execute(statement, parameters),
    seed: (table: string, rows: readonly MemoryRow[]): void => sql.seed(table, rows),
    rowsOf: (table: string): readonly MemoryRow[] => sql.rowsOf(table),
    rowCount: (table: string): number => sql.rowsOf(table).length,
    clear: (): void => sql.clear(),
  };
}

/** A fake with the whole schema applied, ready for the stores. */
export async function createFakeSql(): Promise<FakeSql> {
  const sql = createMemorySql();
  await createDdlRunner(sql).ensureSchema(DDL);
  return wrap(sql);
}

/** A fake with no table at all, for the schema tests themselves. */
export function createBareFakeSql(): FakeSql {
  return wrap(createMemorySql());
}

/**
 * True when every SELECT the stores sent is scoped and bounded (SPEC §19):
 * a `WHERE` always, and a `LIMIT` on every read that returns a list. The
 * three aggregates answer one row and name nobody, so they are exempt from
 * the `LIMIT` — but not from the `WHERE`.
 */
export function allSelectsBounded(sql: { readonly statements: readonly string[] }): boolean {
  return sql.statements
    .filter((statement) => /^\s*SELECT/i.test(statement))
    .every((statement) => {
      if (!/\bWHERE\b/i.test(statement)) return false;
      const aggregateOnly = /^\s*SELECT\s+(?:(?:COUNT|SUM|MAX)\s*\([^)]*\)(?:\s+AS\s+\w+)?\s*,?\s*)+FROM/i.test(
        statement,
      );
      return aggregateOnly || /\bLIMIT\b/i.test(statement);
    });
}

/** True when no statement the stores sent deletes anything (SPEC §20). */
export function nothingDeleted(sql: { readonly statements: readonly string[] }): boolean {
  return !sql.statements.some((statement) => /^\s*DELETE\b/i.test(statement));
}
