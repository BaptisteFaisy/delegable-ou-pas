/**
 * Trial store (SPEC §11, SPEC §18 tables `trial` and `trial_assignment`,
 * DP-27, recipe 16).
 *
 * The controlled draw: one row per trial, one row per ticket drawn, keyed by
 * (trial, ticket) so replaying a draw never duplicates an assignment
 * (SPEC §11 step 2). Nothing is deleted: a trial that stops keeps its rows
 * and its state changes (SPEC §20).
 *
 * The frozen `trial` row has no column for the epoch, the seed or the stop
 * reason; the assignments survive in `trial_assignment`.
 * CONTRACT-NEEDED: src/types-persistence.ts.TrialRow.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { TrialStore } from '../ports.js';
import type { Trial, TrialAssignment } from '../types-advice.js';
import type { TrialAssignmentRow, TrialRow } from '../types-persistence.js';
import {
  toTrial,
  toTrialAssignment,
  toTrialAssignmentRow,
  toTrialRow,
} from './mapping-advice.js';
import { selectList, selectOne } from './rows.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TRIAL_COLUMNS = [
  'id',
  'project_id',
  'cohort_key',
  'starts_at',
  'ends_at',
  'state',
] as const;
const ASSIGNMENT_COLUMNS = [
  'trial_id',
  'issue_id',
  'arm',
  'complied',
  'excluded_reason',
] as const;

const UPSERT_TRIAL = upsertStatement('trial', TRIAL_COLUMNS, ['id']);
const UPSERT_ASSIGNMENT = upsertStatement(
  'trial_assignment',
  ASSIGNMENT_COLUMNS,
  ['trial_id', 'issue_id'],
);
const TRIAL_BY_ID = selectStatement('trial', TRIAL_COLUMNS, 'id = ?');
const TRIAL_BY_PROJECT = selectStatement('trial', TRIAL_COLUMNS, 'project_id = ?', 'starts_at DESC');
const ASSIGNMENT_BY_KEY = selectStatement(
  'trial_assignment',
  ASSIGNMENT_COLUMNS,
  'trial_id = ? AND issue_id = ?',
);
const ASSIGNMENTS_BY_TRIAL = selectStatement(
  'trial_assignment',
  ASSIGNMENT_COLUMNS,
  'trial_id = ?',
  'issue_id ASC',
);

/** Controlled trials and their draws (SPEC §11, DP-27). */
export function createTrialStore(client: SqlClient): TrialStore {
  return {
    async get(trialId: string): Promise<Trial | null> {
      const row = await selectOne<TrialRow>(client, TRIAL_BY_ID, [trialId]);
      return row ? toTrial(row) : null;
    },
    async listByProject(projectId: string): Promise<Trial[]> {
      const rows = await selectList<TrialRow>(client, TRIAL_BY_PROJECT, [projectId]);
      return rows.map((row) => toTrial(row));
    },
    async save(trial: Trial): Promise<void> {
      const row = toTrialRow(trial);
      await client.execute(UPSERT_TRIAL, rowParameters(row, TRIAL_COLUMNS));
    },
    async getAssignment(trialId: string, issueId: string): Promise<TrialAssignment | null> {
      const row = await selectOne<TrialAssignmentRow>(client, ASSIGNMENT_BY_KEY, [
        trialId,
        issueId,
      ]);
      return row ? toTrialAssignment(row) : null;
    },
    async saveAssignment(assignment: TrialAssignment): Promise<void> {
      const row = toTrialAssignmentRow(assignment);
      await client.execute(UPSERT_ASSIGNMENT, rowParameters(row, ASSIGNMENT_COLUMNS));
    },
    async listAssignments(trialId: string): Promise<TrialAssignment[]> {
      const rows = await selectList<TrialAssignmentRow>(client, ASSIGNMENTS_BY_TRIAL, [trialId]);
      return rows.map((row) => toTrialAssignment(row));
    },
  };
}
