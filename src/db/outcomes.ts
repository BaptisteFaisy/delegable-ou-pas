/**
 * Outcome store (SPEC §6 "Mesurer ce qui arrive ensuite", SPEC §18 table
 * `outcome`, DP-04).
 *
 * What happened to a ticket after closure: delay, reopening, following bugs,
 * neighbour bugs, incidents, takeover, abandonment, clean closure, and the
 * date at which the ticket became judgeable. The nightly job reads the
 * tickets that matured since its last run (SPEC §17): one bounded read on an
 * indexed date, never a scan.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { OutcomeStore } from '../ports.js';
import type { Outcome } from '../types.js';
import type { OutcomeRow } from '../types-persistence.js';
import { toOutcome, toOutcomeRow } from './mapping-outcome.js';
import { selectList, selectOne } from './rows.js';
import { projectScope } from './scope.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'outcome';
const COLUMNS = [
  'issue_id',
  'closed_at',
  'lead_time_h',
  'reopened',
  'caused_bugs',
  'neighbor_bugs',
  'incidents',
  'takeover',
  'abandoned',
  'clean',
  'mature_at',
] as const;
const KEY = ['issue_id'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_ISSUE = selectStatement(TABLE, COLUMNS, 'issue_id = ?');
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'issue_id LIKE ?', 'mature_at ASC');
const MATURED_SINCE = selectStatement(
  TABLE,
  COLUMNS,
  'issue_id LIKE ? AND mature_at >= ?',
  'mature_at ASC',
);

/** What happened to each ticket afterwards (SPEC §6, DP-04). */
export function createOutcomeStore(client: SqlClient): OutcomeStore {
  return {
    async get(issueId: string): Promise<Outcome | null> {
      const row = await selectOne<OutcomeRow>(client, BY_ISSUE, [issueId]);
      return row ? toOutcome(row) : null;
    },
    async save(outcome: Outcome): Promise<void> {
      const row = toOutcomeRow(outcome);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
    async listByProject(projectId: string, limit: number): Promise<Outcome[]> {
      const rows = await selectList<OutcomeRow>(
        client,
        BY_PROJECT,
        [projectScope(projectId)],
        limit,
      );
      return rows.map((row) => toOutcome(row));
    },
    async listMaturedSince(
      projectId: string,
      since: string,
      limit: number,
    ): Promise<Outcome[]> {
      const rows = await selectList<OutcomeRow>(
        client,
        MATURED_SINCE,
        [projectScope(projectId), since],
        limit,
      );
      return rows.map((row) => toOutcome(row));
    },
  };
}
