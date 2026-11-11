/**
 * Coverage store (SPEC §16.6, SPEC §13, SPEC §19, DP-19, recipe 15).
 *
 * One row per project: how much of the involvement is known, what each right
 * on the graph is worth, and when the last collection ran. A missing right
 * never raises — it empties the result upstream (SPEC §19) and is recorded
 * here as a state, so the screen can tell "no right" from "no data".
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { CoverageStore } from '../ports.js';
import type { Coverage } from '../types-advice.js';
import type { CoverageRow } from '../types-persistence.js';
import { toCoverage, toCoverageRow } from './mapping-collection.js';
import { selectOne } from './rows.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'coverage';
const COLUMNS = [
  'project_id',
  'known_issues',
  'total_issues',
  'permissions_json',
  'last_collection_at',
  'last_collection_ok',
  'demo',
] as const;
const KEY = ['project_id'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'project_id = ?');

/** The coverage screen: known involvement, graph rights (SPEC §16.6, DP-19). */
export function createCoverageStore(client: SqlClient): CoverageStore {
  return {
    async get(projectId: string): Promise<Coverage | null> {
      const row = await selectOne<CoverageRow>(client, BY_PROJECT, [projectId]);
      return row ? toCoverage(row) : null;
    },
    async save(coverage: Coverage): Promise<void> {
      const row = toCoverageRow(coverage);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
  };
}
