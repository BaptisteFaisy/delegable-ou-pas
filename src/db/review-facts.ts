/**
 * Review facts store (SPEC §6 "Relecture", SPEC §18 table `review_fact`,
 * DP-05).
 *
 * What the graph says of a pull request: how many reviewers, how many asked
 * for changes, how many comments, how many commits after the opening, and
 * the dates. The load is an approximation read from the graph, never a
 * history of round trips (SPEC §19).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { ReviewFactStore } from '../ports.js';
import type { ReviewFact } from '../types.js';
import type { ReviewFactRow } from '../types-persistence.js';
import { toReviewFact, toReviewFactRow } from './mapping-outcome.js';
import { selectList } from './rows.js';
import { projectScope } from './scope.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'review_fact';
const COLUMNS = [
  'issue_id',
  'pr_ref',
  'reviewer_count',
  'changes_requested',
  'comment_count',
  'commits_after_open',
  'opened_at',
  'merged_at',
] as const;
const KEY = ['issue_id', 'pr_ref'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_ISSUE = selectStatement(TABLE, COLUMNS, 'issue_id = ?', 'pr_ref ASC');
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'issue_id LIKE ?', 'opened_at DESC');

/** Review facts, read from the graph (SPEC §6, DP-05). */
export function createReviewFactStore(client: SqlClient): ReviewFactStore {
  return {
    async listByIssue(issueId: string): Promise<ReviewFact[]> {
      const rows = await selectList<ReviewFactRow>(client, BY_ISSUE, [issueId]);
      return rows.map((row) => toReviewFact(row));
    },
    async saveMany(facts: readonly ReviewFact[]): Promise<void> {
      for (const fact of facts) {
        const row = toReviewFactRow(fact);
        await client.execute(UPSERT, rowParameters(row, COLUMNS));
      }
    },
    async listByProject(projectId: string, limit: number): Promise<ReviewFact[]> {
      const rows = await selectList<ReviewFactRow>(
        client,
        BY_PROJECT,
        [projectScope(projectId)],
        limit,
      );
      return rows.map((row) => toReviewFact(row));
    },
  };
}
