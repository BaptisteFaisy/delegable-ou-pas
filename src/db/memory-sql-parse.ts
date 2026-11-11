/**
 * Parsing of the SQL dialect used by the stores (SPEC §19, DP-20).
 *
 * Forge SQL is MySQL-flavoured, so the statements of `src/db` are written the
 * MySQL way: `?` placeholders, `INSERT ... ON DUPLICATE KEY UPDATE`,
 * `CREATE TABLE IF NOT EXISTS`, inline `INDEX`. This module turns such a
 * statement into a plan; `memory-sql.ts` executes the plan.
 *
 * The grammar understood here is deliberately the narrow one the app uses:
 * one table per statement, `AND`-joined conditions, `ORDER BY`, `LIMIT`, and
 * the aggregates `COUNT(*)`, `SUM(col)`, `MAX(col)`. Anything else throws,
 * loudly, at the first call — a development error, never a silent wrong
 * answer (SPEC §20).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** One condition of a `WHERE` clause. */
export interface Condition {
  readonly column: string;
  /** `=`, `<>`, `<`, `<=`, `>`, `>=`, `LIKE` or `IS NOT NULL`. */
  readonly operator: string;
  /** Index of the bound parameter, when the right side is a `?`. */
  readonly parameter: number | null;
  /** Literal right side, when the right side is quoted. */
  readonly literal: string | null;
}

/** One projected column. */
export interface SelectItem {
  readonly kind: 'column' | 'count' | 'sum' | 'max';
  readonly column: string;
  readonly alias: string;
}

/** One `ORDER BY` term. */
export interface OrderTerm {
  readonly column: string;
  readonly descending: boolean;
}

/** A parsed `SELECT`. */
export interface ParsedSelect {
  readonly table: string;
  readonly items: readonly SelectItem[];
  readonly where: readonly Condition[];
  readonly order: readonly OrderTerm[];
  /** Bound parameter index of the `LIMIT`, when it is a `?`. */
  readonly limitParameter: number | null;
  /** Literal limit, when it is written as a number. */
  readonly limit: number | null;
}

/** A parsed `INSERT`. */
export interface ParsedInsert {
  readonly table: string;
  readonly columns: readonly string[];
  /** Index of the bound parameter of each column, in order. */
  readonly parameters: readonly number[];
  /** Columns updated when the row already exists. */
  readonly updates: readonly string[];
}

/** A parsed `UPDATE`. */
export interface ParsedUpdate {
  readonly table: string;
  /** `SET col = ?`. */
  readonly sets: readonly { readonly column: string; readonly parameter: number }[];
  /** `SET col = col + ?`. */
  readonly increments: readonly { readonly column: string; readonly parameter: number }[];
  readonly where: readonly Condition[];
}

/** A parsed `CREATE TABLE`. */
export interface ParsedTable {
  readonly name: string;
  readonly columns: readonly string[];
  readonly primaryKey: readonly string[];
}

/**
 * Replaces every `?` by a marker carrying its index, so a parser can tell
 * which bound parameter a condition talks about.
 */
export function markPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `__P${index++}__`);
}

/** Splits on the commas that are not inside parentheses. */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

/** The columns and the natural key of a `CREATE TABLE`. */
export function parseCreateTable(statement: string): ParsedTable {
  const match = /^CREATE TABLE IF NOT EXISTS\s+([A-Za-z_]\w*)\s*\(([\s\S]+)\)$/i.exec(
    statement.trim(),
  );
  if (!match) throw new Error(`Unsupported CREATE statement: ${statement}`);
  const columns: string[] = [];
  const primaryKey: string[] = [];
  for (const definition of splitTopLevel(match[2])) {
    const key = /^PRIMARY KEY\s*\(([^)]*)\)$/i.exec(definition);
    if (key) {
      primaryKey.push(...splitTopLevel(key[1]).map((column) => column.trim()));
      continue;
    }
    if (/^(INDEX|KEY|UNIQUE|CONSTRAINT)\b/i.test(definition)) continue;
    columns.push(definition.split(/\s+/)[0]);
  }
  return { name: match[1], columns, primaryKey };
}

/** One condition of a `WHERE` clause, or `null` when it is not understood. */
function parseCondition(text: string): Condition | null {
  const notNull = /^(\w+)\s+IS\s+NOT\s+NULL$/i.exec(text);
  if (notNull) {
    return { column: notNull[1], operator: 'IS NOT NULL', parameter: null, literal: null };
  }
  const comparison = /^(\w+)\s*(<=|>=|<>|!=|=|<|>)\s*(?:__P(\d+)__|'([^']*)')$/.exec(text);
  if (comparison) {
    return {
      column: comparison[1],
      operator: comparison[2] === '!=' ? '<>' : comparison[2],
      parameter: comparison[3] === undefined ? null : Number(comparison[3]),
      literal: comparison[4] === undefined ? null : comparison[4],
    };
  }
  const like = /^(\w+)\s+LIKE\s+(?:__P(\d+)__|'([^']*)')$/i.exec(text);
  if (like) {
    return {
      column: like[1],
      operator: 'LIKE',
      parameter: like[2] === undefined ? null : Number(like[2]),
      literal: like[3] === undefined ? null : like[3],
    };
  }
  return null;
}

/** The conditions of a `WHERE` clause. */
export function parseWhere(text: string): Condition[] {
  if (!text.trim()) return [];
  const conditions: Condition[] = [];
  for (const part of text.split(/\s+AND\s+/i)) {
    const condition = parseCondition(part.trim());
    if (!condition) throw new Error(`Unsupported WHERE condition: ${part}`);
    conditions.push(condition);
  }
  return conditions;
}

/** The projected items of a `SELECT`. */
function parseItems(text: string): SelectItem[] {
  return splitTopLevel(text).map((raw) => {
    const item = raw.trim();
    const alias = /\s+AS\s+([A-Za-z_]\w*)$/i.exec(item);
    const name = alias ? item.slice(0, alias.index).trim() : item;
    const key = alias ? alias[1] : name;
    const count = /^COUNT\s*\(\s*\*\s*\)$/i.exec(name);
    if (count) return { kind: 'count', column: '*', alias: key };
    const sum = /^SUM\s*\(\s*(\w+)\s*\)$/i.exec(name);
    if (sum) return { kind: 'sum', column: sum[1], alias: key };
    const max = /^MAX\s*\(\s*(\w+)\s*\)$/i.exec(name);
    if (max) return { kind: 'max', column: max[1], alias: key };
    return { kind: 'column', column: name, alias: key };
  });
}

/** The `ORDER BY` terms of a `SELECT`. */
function parseOrder(text: string): OrderTerm[] {
  if (!text.trim()) return [];
  return splitTopLevel(text).map((raw) => {
    const parts = raw.trim().split(/\s+/);
    return { column: parts[0], descending: (parts[1] ?? 'ASC').toUpperCase() === 'DESC' };
  });
}

/** A `SELECT` statement, parsed. */
export function parseSelect(statement: string): ParsedSelect {
  const head = /^SELECT\s+([\s\S]+?)\s+FROM\s+([A-Za-z_]\w*)/i.exec(statement.trim());
  if (!head) throw new Error(`Unsupported SELECT statement: ${statement}`);
  const rest = statement.trim().slice(head[0].length);
  const whereAt = rest.toUpperCase().indexOf('WHERE');
  const orderAt = rest.toUpperCase().indexOf('ORDER BY');
  const limitAt = rest.toUpperCase().indexOf('LIMIT');
  const whereEnd = [orderAt, limitAt].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  const whereText = whereAt >= 0 ? rest.slice(whereAt + 5, whereEnd ?? rest.length) : '';
  const orderEnd = limitAt >= 0 ? limitAt : rest.length;
  const orderText = orderAt >= 0 ? rest.slice(orderAt + 8, orderEnd) : '';
  const limitText = limitAt >= 0 ? rest.slice(limitAt + 5).trim() : '';
  const limitMatch = /^(?:__P(\d+)__|(\d+))$/.exec(limitText);
  return {
    table: head[2],
    items: parseItems(head[1]),
    where: parseWhere(whereText),
    order: parseOrder(orderText),
    limitParameter: limitMatch?.[1] === undefined ? null : Number(limitMatch[1]),
    limit: limitMatch?.[2] === undefined ? null : Number(limitMatch[2]),
  };
}

/** An `INSERT` statement, parsed. */
export function parseInsert(statement: string): ParsedInsert {
  const match = /^INSERT INTO\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)([\s\S]*)$/i.exec(
    statement.trim(),
  );
  if (!match) throw new Error(`Unsupported INSERT statement: ${statement}`);
  const columns = splitTopLevel(match[2]);
  const parameters = splitTopLevel(match[3]).map((value) => {
    const index = /^__P(\d+)__$/.exec(value);
    if (!index) throw new Error(`Only bound parameters are supported: ${value}`);
    return Number(index[1]);
  });
  return { table: match[1], columns, parameters, updates: parseUpdates(match[4]) };
}

/** The columns updated by an `ON DUPLICATE KEY UPDATE` clause. */
function parseUpdates(tail: string): string[] {
  const match = /ON DUPLICATE KEY UPDATE\s+([\s\S]+)$/i.exec(tail);
  if (!match) return [];
  return splitTopLevel(match[1])
    .map((assignment) => /^(\w+)\s*=/.exec(assignment)?.[1] ?? '')
    .filter((column) => column !== '');
}

/** An `UPDATE` statement, parsed. */
export function parseUpdate(statement: string): ParsedUpdate {
  const match = /^UPDATE\s+([A-Za-z_]\w*)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i.exec(
    statement.trim(),
  );
  if (!match) throw new Error(`Unsupported UPDATE statement: ${statement}`);
  const sets: { column: string; parameter: number }[] = [];
  const increments: { column: string; parameter: number }[] = [];
  for (const assignment of splitTopLevel(match[2])) {
    const increment = /^(\w+)\s*=\s*\w+\s*\+\s*__P(\d+)__$/.exec(assignment.trim());
    if (increment) {
      increments.push({ column: increment[1], parameter: Number(increment[2]) });
      continue;
    }
    const set = /^(\w+)\s*=\s*__P(\d+)__$/.exec(assignment.trim());
    if (!set) throw new Error(`Unsupported assignment: ${assignment}`);
    sets.push({ column: set[1], parameter: Number(set[2]) });
  }
  return { table: match[1], sets, increments, where: parseWhere(match[3]) };
}
