/**
 * The in-memory SQL engine (SPEC §13, SPEC §20 demo mode; DP-18).
 *
 * One implementation, two uses:
 * - `src/db/stub.ts` runs the whole app on it when Forge SQL is absent, so
 *   the demo dataset of lot L9 flows through the very same stores and the
 *   very same statements as production;
 * - `tests/db/sql-fake.ts` wraps it, so a test exercises the real SQL of the
 *   stores instead of a canned answer.
 *
 * It executes the narrow dialect the stores write (see `memory-sql-parse.ts`):
 * `CREATE TABLE IF NOT EXISTS`, upserts on the natural key, bounded `SELECT`s
 * with `WHERE` / `ORDER BY` / `LIMIT`, the three aggregates, and the counter
 * `UPDATE`. A statement outside the dialect throws: a development error,
 * never a silent wrong answer.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import {
  markPlaceholders,
  parseCreateTable,
  parseInsert,
  parseSelect,
  parseUpdate,
  type Condition,
  type OrderTerm,
  type ParsedSelect,
  type SelectItem,
} from './memory-sql-parse.js';

/** One stored row: column name -> value. */
export interface MemoryRow {
  [column: string]: unknown;
}

/** One table: its shape and its rows, in insertion order. */
export interface MemoryTable {
  readonly name: string;
  readonly columns: readonly string[];
  readonly primaryKey: readonly string[];
  readonly rows: MemoryRow[];
}

/** The engine, with the surface the stores and the tests need. */
export interface MemorySql {
  readonly tables: Map<string, MemoryTable>;
  /** Every statement received, in order — what the tests assert on. */
  readonly statements: string[];
  query<Row>(statement: string, parameters?: readonly unknown[]): Promise<Row[]>;
  execute(statement: string, parameters?: readonly unknown[]): Promise<void>;
  /** Inserts rows straight into a table, bypassing SQL (test seeding). */
  seed(table: string, rows: readonly MemoryRow[]): void;
  rowsOf(table: string): readonly MemoryRow[];
  clear(): void;
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function textOf(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function equal(value: unknown, expected: unknown): boolean {
  if (value === null || value === undefined) {
    return expected === null || expected === undefined;
  }
  if (typeof value === 'number' && typeof expected === 'number') return value === expected;
  return textOf(value) === textOf(expected);
}

/** Compares two column values: numbers numerically, the rest as text. */
function compare(value: unknown, expected: unknown): number {
  if (typeof value === 'number' && typeof expected === 'number') {
    return value < expected ? -1 : value > expected ? 1 : 0;
  }
  const left = textOf(value);
  const right = textOf(expected);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** MySQL `LIKE`: `%` is any run, `_` is one character. */
function like(value: string, pattern: string): boolean {
  const source = pattern
    .split('')
    .map((char) => (char === '%' ? '.*' : char === '_' ? '.' : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${source}$`).test(value);
}

/** True when one row satisfies one condition. */
function matches(row: MemoryRow, condition: Condition, parameters: readonly unknown[]): boolean {
  const value = row[condition.column];
  if (condition.operator === 'IS NOT NULL') return value !== null && value !== undefined;
  const expected =
    condition.parameter !== null ? parameters[condition.parameter] : condition.literal;
  switch (condition.operator) {
    case '=':
      return equal(value, expected);
    case '<>':
      return !equal(value, expected);
    case '>':
      return compare(value, expected) > 0;
    case '>=':
      return compare(value, expected) >= 0;
    case '<':
      return compare(value, expected) < 0;
    case '<=':
      return compare(value, expected) <= 0;
    case 'LIKE':
      return like(textOf(value), textOf(expected));
    default:
      throw new Error(`Unsupported operator: ${condition.operator}`);
  }
}

function matchesAll(
  row: MemoryRow,
  conditions: readonly Condition[],
  parameters: readonly unknown[],
): boolean {
  return conditions.every((condition) => matches(row, condition, parameters));
}

/** Stable sort on the `ORDER BY` terms, in order. */
function orderRows(rows: MemoryRow[], order: readonly OrderTerm[]): MemoryRow[] {
  if (order.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const term of order) {
      const result = compare(left[term.column], right[term.column]);
      if (result !== 0) return term.descending ? -result : result;
    }
    return 0;
  });
}

/** One aggregate over the filtered rows; `COUNT` answers 0 on an empty set. */
function aggregate(item: SelectItem, rows: readonly MemoryRow[]): unknown {
  if (item.kind === 'count') return rows.length;
  if (item.kind === 'sum') {
    return rows.reduce((total, row) => total + numberOf(row[item.column]), 0);
  }
  if (rows.length === 0) return null;
  return rows.reduce((best, row) =>
    compare(row[item.column], best) > 0 ? row[item.column] : best,
  rows[0][item.column]);
}

/** The projected row of one stored row. */
function project(row: MemoryRow, items: readonly SelectItem[]): MemoryRow {
  const projected: MemoryRow = {};
  for (const item of items) {
    projected[item.alias] = item.kind === 'column' ? row[item.column] : null;
  }
  return projected;
}

/** Runs a parsed `SELECT` over one table. */
function runSelect(
  table: MemoryTable,
  parsed: ParsedSelect,
  parameters: readonly unknown[],
): MemoryRow[] {
  const filtered = table.rows.filter((row) => matchesAll(row, parsed.where, parameters));
  if (parsed.items.every((item) => item.kind !== 'column')) {
    const aggregated: MemoryRow = {};
    for (const item of parsed.items) aggregated[item.alias] = aggregate(item, filtered);
    return [aggregated];
  }
  const ordered = orderRows(filtered, parsed.order);
  const limit =
    parsed.limitParameter !== null
      ? numberOf(parameters[parsed.limitParameter])
      : parsed.limit;
  const page = limit === null ? ordered : ordered.slice(0, Math.max(0, limit));
  return page.map((row) => project(row, parsed.items));
}

/** Applies one upsert: replace on the natural key, insert otherwise. */
function runInsert(table: MemoryTable, statement: string, parameters: readonly unknown[]): void {
  const parsed = parseInsert(statement);
  const values: MemoryRow = {};
  parsed.columns.forEach((column, index) => {
    values[column] = parameters[parsed.parameters[index]];
  });
  const existing = table.primaryKey.length === 0
    ? undefined
    : table.rows.find((row) =>
        table.primaryKey.every((column) => equal(row[column], values[column])),
      );
  if (!existing) {
    table.rows.push(values);
    return;
  }
  for (const column of parsed.updates) existing[column] = values[column];
}

/** Applies one bounded `UPDATE`. */
function runUpdate(table: MemoryTable, statement: string, parameters: readonly unknown[]): void {
  const parsed = parseUpdate(statement);
  for (const row of table.rows) {
    if (!matchesAll(row, parsed.where, parameters)) continue;
    for (const set of parsed.sets) row[set.column] = parameters[set.parameter];
    for (const step of parsed.increments) {
      row[step.column] = numberOf(row[step.column]) + numberOf(parameters[step.parameter]);
    }
  }
}

/** A fresh engine: no table, no row, no statement. */
export function createMemorySql(): MemorySql {
  const tables = new Map<string, MemoryTable>();
  const statements: string[] = [];

  function tableOf(name: string): MemoryTable {
    const table = tables.get(name);
    if (!table) throw new Error(`Unknown table: ${name}`);
    return table;
  }

  function run(statement: string, parameters: readonly unknown[]): MemoryRow[] {
    const marked = markPlaceholders(statement);
    if (/^\s*SELECT/i.test(marked)) {
      const parsed = parseSelect(marked);
      return runSelect(tableOf(parsed.table), parsed, parameters);
    }
    if (/^\s*INSERT/i.test(marked)) {
      runInsert(tableOf(parseInsert(marked).table), marked, parameters);
      return [];
    }
    if (/^\s*UPDATE/i.test(marked)) {
      runUpdate(tableOf(parseUpdate(marked).table), marked, parameters);
      return [];
    }
    if (/^\s*CREATE TABLE IF NOT EXISTS/i.test(marked)) {
      const parsed = parseCreateTable(marked);
      if (!tables.has(parsed.name)) {
        tables.set(parsed.name, {
          name: parsed.name,
          columns: parsed.columns,
          primaryKey: parsed.primaryKey,
          rows: [],
        });
      }
      return [];
    }
    throw new Error(`Unsupported statement: ${statement}`);
  }

  const engine: MemorySql = {
    tables,
    statements,
    async query<Row>(statement: string, parameters: readonly unknown[] = []): Promise<Row[]> {
      statements.push(statement);
      return run(statement, parameters) as Row[];
    },
    async execute(statement: string, parameters: readonly unknown[] = []): Promise<void> {
      statements.push(statement);
      run(statement, parameters);
    },
    seed(table: string, rows: readonly MemoryRow[]): void {
      tableOf(table).rows.push(...rows.map((row) => ({ ...row })));
    },
    rowsOf(table: string): readonly MemoryRow[] {
      return tableOf(table).rows;
    },
    clear(): void {
      for (const table of tables.values()) table.rows.length = 0;
    },
  };
  return engine;
}
