/**
 * Graph cursor store (SPEC §17 "Ce qu'impose le graphe", SPEC §18 table
 * `graph_cursor`, DP-18).
 *
 * The graph is only readable on behalf of a signed-in user, so a collection
 * runs in slices during a session and resumes where it stopped: one row per
 * (project, object type) holds the last ticket collected and when the slice
 * ran. `get` answers `null` before the first slice — absent data is normal
 * (SPEC §20) — and `save` replaces the row, so replaying a slice never moves
 * the cursor backwards into a duplicate.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { GraphCursorStore } from '../ports.js';
import type { GraphObjectType } from '../types.js';
import type { GraphCursor } from '../types-graph.js';
import type { GraphCursorRow } from '../types-persistence.js';
import { toGraphCursor, toGraphCursorRow } from './mapping-collection.js';
import { selectList, selectOne } from './rows.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'graph_cursor';
const COLUMNS = ['project_id', 'object_type', 'last_issue_id', 'last_run_at'] as const;
const KEY = ['project_id', 'object_type'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_KEY = selectStatement(TABLE, COLUMNS, 'project_id = ? AND object_type = ?');
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'project_id = ?', 'object_type ASC');

/** Where a collection stopped, per object type (SPEC §17, DP-18). */
export function createGraphCursorStore(client: SqlClient): GraphCursorStore {
  return {
    async get(projectId: string, objectType: GraphObjectType): Promise<GraphCursor | null> {
      const row = await selectOne<GraphCursorRow>(client, BY_KEY, [projectId, objectType]);
      return row ? toGraphCursor(row) : null;
    },
    async save(cursor: GraphCursor): Promise<void> {
      const row = toGraphCursorRow(cursor);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
    async listByProject(projectId: string): Promise<GraphCursor[]> {
      const rows = await selectList<GraphCursorRow>(client, BY_PROJECT, [projectId]);
      return rows.map((row) => toGraphCursor(row));
    },
  };
}
