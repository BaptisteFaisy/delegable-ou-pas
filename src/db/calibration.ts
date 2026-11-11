/**
 * Calibration store (SPEC §10, SPEC §18 table `calibration`, DP-21).
 *
 * How right the past recommendations were: one row per recommendation value,
 * per epoch, with the clean closure observed afterwards, its sample size and
 * its interval. The figures are computed by the domain; this store only
 * caches them.
 *
 * Anonymity (DP-17, SPEC §18 last line): a calibration row is a statistic —
 * it names no person, it holds no identifier of any kind.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { CalibrationStore } from '../ports.js';
import type { Calibration } from '../types-advice.js';
import type { CalibrationRowDb } from '../types-persistence.js';
import { toCalibration, toCalibrationRow } from './mapping-stats.js';
import { selectList } from './rows.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'calibration';
const COLUMNS = [
  'project_id',
  'epoch_id',
  'value',
  'n',
  'clean_rate',
  'ci_low',
  'ci_high',
] as const;
const KEY = ['project_id', 'epoch_id', 'value'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_EPOCH = selectStatement(TABLE, COLUMNS, 'project_id = ? AND epoch_id = ?', 'value ASC');

/** How right the past recommendations were (SPEC §10, DP-21). */
export function createCalibrationStore(client: SqlClient): CalibrationStore {
  return {
    async listByProject(projectId: string, epochId: string): Promise<Calibration[]> {
      const rows = await selectList<CalibrationRowDb>(client, BY_EPOCH, [projectId, epochId]);
      return rows.map((row) => toCalibration(row));
    },
    async saveMany(rowsToSave: readonly Calibration[]): Promise<void> {
      for (const calibration of rowsToSave) {
        const row = toCalibrationRow(calibration);
        await client.execute(UPSERT, rowParameters(row, COLUMNS));
      }
    },
  };
}
