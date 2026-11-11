/**
 * Settings store (SPEC §16.5, SPEC §13 "La date d'adoption", SPEC §18 table
 * `settings`, DP-20).
 *
 * What a project declared: the sample threshold, the adoption date that
 * splits "without agent" from "with agent", the taxonomy (natures, zones,
 * sizes, sensitive zones), its own definition of a strengthened review, and
 * the statuses that do not count in the delay. The declared lists travel as
 * one stable JSON payload in a `TEXT` column (SPEC §18).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { SettingsStore } from '../ports.js';
import type { ProjectSettings } from '../types-advice.js';
import type { SettingsRow } from '../types-persistence.js';
import { toProjectSettings, toSettingsRow } from './mapping-collection.js';
import { selectList, selectOne } from './rows.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'settings';
const COLUMNS = [
  'project_id',
  'project_key',
  'min_arm_size',
  'adoption_date',
  'taxonomy_json',
  'hardened_review_json',
  'waiting_statuses_json',
  'demo',
  'updated_at',
] as const;
const KEY = ['project_id'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'project_id = ?');
const ALL = selectStatement(TABLE, COLUMNS, 'project_id IS NOT NULL', 'project_id ASC');

/** The settings of a project (SPEC §16.5, SPEC §13). */
export function createSettingsStore(client: SqlClient): SettingsStore {
  return {
    async get(projectId: string): Promise<ProjectSettings | null> {
      const row = await selectOne<SettingsRow>(client, BY_PROJECT, [projectId]);
      return row ? toProjectSettings(row) : null;
    },
    async save(settings: ProjectSettings): Promise<void> {
      const row = toSettingsRow(settings);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
    async list(limit: number): Promise<ProjectSettings[]> {
      const rows = await selectList<SettingsRow>(client, ALL, [], limit);
      return rows.map((row) => toProjectSettings(row));
    },
  };
}
