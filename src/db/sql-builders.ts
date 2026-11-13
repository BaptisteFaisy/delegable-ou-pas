/**
 * Shared SQL text builders (SPEC §18, SPEC §19, DP-13).
 *
 * One implementation of each statement shape, used by every store: an upsert
 * on the natural key (nothing is deleted, a replay replaces instead of
 * duplicating), a bounded SELECT, a counter increment. Keeping the shapes
 * here is what stops fifteen stores from inventing fifteen dialects.
 *
 * Placeholders are positional `?`, the Forge SQL (MySQL-flavoured) way.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** `?, ?, ?` — one placeholder per value. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/**
 * `INSERT INTO t (a, b) VALUES (?, ?) ON DUPLICATE KEY UPDATE b = VALUES(b)`
 *
 * The idempotent write of the app: the natural key (the table's primary key)
 * decides whether the row is created or replaced, so replaying the same write
 * twice leaves exactly one row (SPEC §20 "rien ne se supprime").
 */
export function upsertStatement(
  table: string,
  columns: readonly string[],
  keyColumns: readonly string[],
): string {
  const updates = columns
    .filter((column) => !keyColumns.includes(column))
    .map((column) => `${column} = VALUES(${column})`)
    .join(', ');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders(columns.length)})
    ON DUPLICATE KEY UPDATE ${updates}`;
}

/**
 * `SELECT a, b FROM t WHERE <condition> ORDER BY <order> LIMIT ?`
 *
 * Every list read is bounded (SPEC §19); `order` keeps the page stable so a
 * keyset pagination resumes exactly where it stopped (DP-18).
 */
export function selectStatement(
  table: string,
  columns: readonly string[],
  where: string,
  order?: string,
): string {
  const orderBy = order ? ` ORDER BY ${order}` : '';
  return `SELECT ${columns.join(', ')} FROM ${table} WHERE ${where}${orderBy} LIMIT ?`;
}

/** `UPDATE t SET counter = counter + 1 WHERE <condition>` — a bounded counter. */
export function incrementStatement(table: string, column: string, where: string): string {
  return `UPDATE ${table} SET ${column} = ${column} + ? WHERE ${where}`;
}

/**
 * The bound values of one row, in column order. Every store writes its rows
 * through it, so an upsert and its column list can never drift apart.
 */
export function rowParameters(row: object, columns: readonly string[]): unknown[] {
  const record = row as Record<string, unknown>;
  return columns.map((column) => record[column]);
}
