/**
 * Involvement store (SPEC §5, SPEC §18 table `involvement`, DP-01).
 *
 * The port of `src/ports.ts`, implemented on Forge SQL through `SqlClient`.
 * SPEC §19 shapes every read: one ticket by its key, or one project by the
 * prefix of its ticket keys (`src/db/scope.ts`), always with a `LIMIT`, and
 * the two counts answered by an aggregate that names nobody (DP-17).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { InvolvementStore } from '../ports.js';
import type { Involvement } from '../types.js';
import type { InvolvementRow } from '../types-persistence.js';
import { toInvolvement, toInvolvementRow } from './mapping-involvement.js';
import { selectAggregate, selectList, selectOne } from './rows.js';
import { projectScope } from './scope.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'involvement';
const COLUMNS = [
  'issue_id',
  'level',
  'source',
  'client',
  'model',
  'session_ref',
  'evidence_json',
  'decided_at',
] as const;
const KEY = ['issue_id'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_ISSUE = selectStatement(TABLE, COLUMNS, 'issue_id = ?');
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'issue_id LIKE ?', 'decided_at ASC');
/** A known level is any level but `unknown` (SPEC §13, DP-19). */
const COUNT_KNOWN =
  "SELECT COUNT(*) AS n FROM involvement WHERE issue_id LIKE ? AND level <> 'unknown'";
const COUNT_TOTAL = 'SELECT COUNT(*) AS n FROM involvement WHERE issue_id LIKE ?';

/** The involvement of each ticket, with the source kept (SPEC §5, DP-01). */
export function createInvolvementStore(client: SqlClient): InvolvementStore {
  return {
    async get(issueId: string): Promise<Involvement | null> {
      const row = await selectOne<InvolvementRow>(client, BY_ISSUE, [issueId]);
      return row ? toInvolvement(row) : null;
    },
    async save(involvement: Involvement): Promise<void> {
      const row = toInvolvementRow(involvement);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
    async listByProject(projectId: string, limit: number): Promise<Involvement[]> {
      const rows = await selectList<InvolvementRow>(
        client,
        BY_PROJECT,
        [projectScope(projectId)],
        limit,
      );
      return rows.map((row) => toInvolvement(row));
    },
    async countKnown(projectId: string): Promise<number> {
      const row = await selectAggregate<{ n: number }>(client, COUNT_KNOWN, [
        projectScope(projectId),
      ]);
      return row ? row.n : 0;
    },
    async countTotal(projectId: string): Promise<number> {
      const row = await selectAggregate<{ n: number }>(client, COUNT_TOTAL, [
        projectScope(projectId),
      ]);
      return row ? row.n : 0;
    },
  };
}
