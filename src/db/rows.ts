/**
 * Bounded reads (SPEC §19, SPEC §18: "aucune liste sans LIMIT").
 *
 * Forge SQL gives five seconds per SELECT and one GiB per installation, so a
 * read is never open-ended: every list goes through `selectList`, which
 * refuses a statement without `LIMIT` and binds the caller's bound (or
 * `DEFAULT_LIMIT`). Pagination is systematic: a caller that needs more asks
 * for the next page with a keyset condition (`WHERE issue_id > ?`), and the
 * collection resumes through `graph_cursor` (DP-18) — never by scanning a
 * whole table.
 *
 * Aggregates (`COUNT`, `SUM`, `MAX`) are the exception: they return one row,
 * and the figures they feed are computed domain-side, never by a complex
 * query (SPEC §19). They go through `selectAggregate`.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { SqlClient } from './sql-client.js';

/** Default page size of every list read (SPEC §19). */
export const DEFAULT_LIMIT = 200;

/** Hard ceiling: a bound above it is clamped, so a caller cannot ask for a scan. */
export const MAX_LIMIT = 1000;

const LIMIT_PLACEHOLDER = /\bLIMIT\s+\?/i;
const HAS_LIMIT = /\bLIMIT\b/i;

/** The bound actually applied: positive, and never above `MAX_LIMIT`. */
export function boundLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

/**
 * Runs a bounded SELECT.
 *
 * The statement must carry a `LIMIT`: with `LIMIT ?` the bound is appended to
 * the parameters, with a literal `LIMIT n` it is left alone. A statement
 * without any `LIMIT` is a development error and throws, because shipping it
 * would risk the five-second ceiling of SPEC §19.
 */
export async function selectList<T>(
  client: SqlClient,
  statement: string,
  parameters: readonly unknown[],
  limit?: number,
): Promise<T[]> {
  if (!HAS_LIMIT.test(statement)) {
    throw new Error('selectList: a list read must carry a LIMIT (SPEC §19).');
  }
  const bound = boundLimit(limit);
  const boundParameters = LIMIT_PLACEHOLDER.test(statement)
    ? [...parameters, bound]
    : [...parameters];
  const rows = await client.query<T>(statement, boundParameters);
  return rows ?? [];
}

/** Runs a bounded SELECT that expects at most one row; `null` when absent. */
export async function selectOne<T>(
  client: SqlClient,
  statement: string,
  parameters: readonly unknown[],
): Promise<T | null> {
  if (!HAS_LIMIT.test(statement)) {
    throw new Error('selectOne: a single-row read must carry a LIMIT (SPEC §19).');
  }
  const boundParameters = LIMIT_PLACEHOLDER.test(statement)
    ? [...parameters, 1]
    : [...parameters];
  const rows = await client.query<T>(statement, boundParameters);
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Runs an aggregate SELECT (`COUNT`, `SUM`, `MAX`) and returns its single row,
 * or `null` when the engine answers nothing. Aggregates carry no identifier:
 * they count tickets, never people (DP-17).
 */
export async function selectAggregate<T>(
  client: SqlClient,
  statement: string,
  parameters: readonly unknown[],
): Promise<T | null> {
  const rows = await client.query<T>(statement, parameters);
  return rows && rows.length > 0 ? rows[0] : null;
}
