/**
 * Epoch store (SPEC §7 rule 6, SPEC §18 table `epoch`, DP-22).
 *
 * One period per agent setup: the figures of two setups are never mixed.
 * `epochAt` answers "which epoch does this date fall in" with one bounded
 * read on an indexed (project, start) pair — the latest epoch that had
 * already started, or `null` before the first one (SPEC §7 rule 6).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { EpochStore } from '../ports.js';
import type { Epoch } from '../types.js';
import type { EpochRow } from '../types-persistence.js';
import { toEpoch, toEpochRow } from './mapping-stats.js';
import { selectList, selectOne } from './rows.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'epoch';
const COLUMNS = [
  'id',
  'project_id',
  'starts_at',
  'label',
  'client',
  'model',
  'instructions_version',
] as const;
const KEY = ['id'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'project_id = ?', 'starts_at ASC');
const AT_DATE = selectStatement(
  TABLE,
  COLUMNS,
  'project_id = ? AND starts_at <= ?',
  'starts_at DESC',
);

/** Epochs: one period per agent setup (SPEC §7 rule 6, DP-22). */
export function createEpochStore(client: SqlClient): EpochStore {
  return {
    async listByProject(projectId: string): Promise<Epoch[]> {
      const rows = await selectList<EpochRow>(client, BY_PROJECT, [projectId]);
      return rows.map((row) => toEpoch(row));
    },
    async save(epoch: Epoch): Promise<void> {
      const row = toEpochRow(epoch);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
    async epochAt(projectId: string, at: string): Promise<Epoch | null> {
      const row = await selectOne<EpochRow>(client, AT_DATE, [projectId, at]);
      return row ? toEpoch(row) : null;
    },
  };
}
