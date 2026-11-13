/**
 * Cohort statistics store (SPEC §7, SPEC §18 table `cohort_stat`, DP-07,
 * DP-08, DP-17).
 *
 * The figures are computed by the domain (L1–L4) during the nightly job and
 * cached here, one row per cohort arm: `listByCohort` therefore returns the
 * two arms of one cohort in one epoch (SPEC §7 rule 3), and
 * `lastComputedAt` feeds the "age of the cache" the screens display
 * (SPEC §20).
 *
 * Anonymity (DP-17): a cohort row carries `people_count` and nothing else
 * about people — a number, used only to mask a cohort carried by too few of
 * them (SPEC §7 rule 8). No identifier of any kind.
 *
 * SPEC §19: the natural key is the cohort itself (project, epoch, nature,
 * zone, size, arm), so a recomputation replaces the row instead of adding
 * one, and every read is a point lookup or a bounded page.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { CohortStatStore } from '../ports.js';
import type { CohortKey } from '../types.js';
import type { CohortStat } from '../types-advice.js';
import type { CohortStatRow } from '../types-persistence.js';
import { asText } from './mapping-codec.js';
import { toCohortStat, toCohortStatRow } from './mapping-stats.js';
import { selectList, selectOne } from './rows.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'cohort_stat';
const COLUMNS = [
  'project_id',
  'epoch_id',
  'nature',
  'zone',
  'size',
  'arm',
  'n',
  'clean_rate',
  'ci_low',
  'ci_high',
  'median_lead_h',
  'review_load',
  'people_count',
  'conclusion',
  'computed_at',
] as const;
const KEY = ['project_id', 'epoch_id', 'nature', 'zone', 'size', 'arm'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_COHORT = selectStatement(
  TABLE,
  COLUMNS,
  'project_id = ? AND epoch_id = ? AND nature = ? AND zone = ? AND size = ?',
  'arm ASC',
);
const BY_EPOCH = selectStatement(
  TABLE,
  COLUMNS,
  'project_id = ? AND epoch_id = ?',
  'computed_at DESC',
);
const LAST_COMPUTED = selectStatement(
  TABLE,
  ['computed_at'],
  'project_id = ?',
  'computed_at DESC',
);

/** The empty string is how a cohort level that ignores a zone stores it. */
function keyParameters(projectId: string, epochId: string, key: CohortKey): unknown[] {
  return [projectId, epochId, key.nature, key.zone ?? '', key.size ?? ''];
}

/** Cohort statistics, cached by the nightly job (SPEC §7, SPEC §17). */
export function createCohortStatStore(client: SqlClient): CohortStatStore {
  return {
    async listByCohort(
      projectId: string,
      epochId: string,
      key: CohortKey,
    ): Promise<CohortStat[]> {
      const rows = await selectList<CohortStatRow>(
        client,
        BY_COHORT,
        keyParameters(projectId, epochId, key),
      );
      return rows.map((row) => toCohortStat(row));
    },
    async listByProject(
      projectId: string,
      epochId: string,
      limit: number,
    ): Promise<CohortStat[]> {
      const rows = await selectList<CohortStatRow>(
        client,
        BY_EPOCH,
        [projectId, epochId],
        limit,
      );
      return rows.map((row) => toCohortStat(row));
    },
    async saveMany(stats: readonly CohortStat[]): Promise<void> {
      for (const stat of stats) {
        const row = toCohortStatRow(stat);
        await client.execute(UPSERT, rowParameters(row, COLUMNS));
      }
    },
    async lastComputedAt(projectId: string): Promise<string> {
      const row = await selectOne<{ computed_at: string }>(client, LAST_COMPUTED, [projectId]);
      return row ? asText(row.computed_at) : '';
    },
  };
}
