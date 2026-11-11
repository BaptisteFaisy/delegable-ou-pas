/**
 * Commit facts store (SPEC §5, SPEC §17, SPEC §18 table `commit_fact`, DP-02).
 *
 * Only facts: a mention was found or not, the agent name, whether the author
 * is a robot, the date. The commit message is never stored (SPEC §17) — the
 * row type of `src/types-persistence.ts` has no column for it.
 *
 * Writes are idempotent: the natural key is (issue, commit), so replaying
 * the same facts replaces the row instead of duplicating it (SPEC §20).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { CommitFactStore } from '../ports.js';
import type { CommitFact } from '../types.js';
import type { CommitFactRow } from '../types-persistence.js';
import { toCommitFact, toCommitFactRow } from './mapping-outcome.js';
import { selectAggregate, selectList } from './rows.js';
import { projectScope } from './scope.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'commit_fact';
const COLUMNS = [
  'issue_id',
  'commit_ref',
  'has_signature',
  'agent_name',
  'author_is_bot',
  'committed_at',
] as const;
const KEY = ['issue_id', 'commit_ref'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_ISSUE = selectStatement(TABLE, COLUMNS, 'issue_id = ?', 'committed_at ASC');
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'issue_id LIKE ?', 'committed_at DESC');
/** A count and a sum: two numbers, no identifier (DP-17). */
const COUNT_BY_ISSUE =
  'SELECT COUNT(*) AS n, SUM(has_signature) AS signed FROM commit_fact WHERE issue_id = ?';

/** Commit facts: a mention found or not, and the agent name (SPEC §17). */
export function createCommitFactStore(client: SqlClient): CommitFactStore {
  return {
    async listByIssue(issueId: string): Promise<CommitFact[]> {
      const rows = await selectList<CommitFactRow>(client, BY_ISSUE, [issueId]);
      return rows.map((row) => toCommitFact(row));
    },
    async saveMany(facts: readonly CommitFact[]): Promise<void> {
      for (const fact of facts) {
        const row = toCommitFactRow(fact);
        await client.execute(UPSERT, rowParameters(row, COLUMNS));
      }
    },
    async listByProject(projectId: string, limit: number): Promise<CommitFact[]> {
      const rows = await selectList<CommitFactRow>(
        client,
        BY_PROJECT,
        [projectScope(projectId)],
        limit,
      );
      return rows.map((row) => toCommitFact(row));
    },
    async countByIssue(issueId: string): Promise<{ total: number; signed: number }> {
      const row = await selectAggregate<{ n: number; signed: number }>(client, COUNT_BY_ISSUE, [
        issueId,
      ]);
      return { total: row?.n ?? 0, signed: row?.signed ?? 0 };
    },
  };
}
