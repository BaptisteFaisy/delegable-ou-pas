/**
 * Recommendation store (SPEC §8, SPEC §18 table `recommendation`, DP-11,
 * DP-12, SPEC §20).
 *
 * The card of a ticket is cached, so the ticket panel answers in under two
 * seconds (SPEC §20). What the row holds is the verdict: the value, the
 * cohort it comes from, the confidence, the reasons, the reference tickets
 * and the date. The figures of the arms live in `cohort_stat` and are
 * recomputed by the domain engine (L4); a card read from the cache alone
 * carries them empty rather than invented — see `mapping-advice.ts`.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { RecommendationStore } from '../ports.js';
import type { RecommendationCard } from '../types-advice.js';
import type { RecommendationRow } from '../types-persistence.js';
import { toRecommendationCard, toRecommendationRow } from './mapping-advice.js';
import { selectList, selectOne } from './rows.js';
import { projectScope } from './scope.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'recommendation';
const COLUMNS = [
  'issue_id',
  'value',
  'cohort_key',
  'confidence',
  'reasons_json',
  'refs_json',
  'computed_at',
] as const;
const KEY = ['issue_id'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_ISSUE = selectStatement(TABLE, COLUMNS, 'issue_id = ?');
const BY_PROJECT = selectStatement(
  TABLE,
  COLUMNS,
  'issue_id LIKE ? AND value = ?',
  'computed_at DESC',
);

/** Recommendation cards, cached (SPEC §8, SPEC §20, DP-11). */
export function createRecommendationStore(client: SqlClient): RecommendationStore {
  return {
    async get(issueId: string): Promise<RecommendationCard | null> {
      const row = await selectOne<RecommendationRow>(client, BY_ISSUE, [issueId]);
      return row ? toRecommendationCard(row) : null;
    },
    async save(card: RecommendationCard): Promise<void> {
      const row = toRecommendationRow(card);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
    async listByProject(
      projectId: string,
      value: RecommendationCard['value'],
      limit: number,
    ): Promise<RecommendationCard[]> {
      const rows = await selectList<RecommendationRow>(
        client,
        BY_PROJECT,
        [projectScope(projectId), value],
        limit,
      );
      return rows.map((row) => toRecommendationCard(row));
    },
  };
}
