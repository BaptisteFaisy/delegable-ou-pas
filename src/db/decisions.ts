/**
 * Decision store (SPEC §8 "Un avis, pas un ordre", SPEC §18 table `decision`,
 * DP-13).
 *
 * The decision taken on a ticket, and whether it followed the recommendation
 * shown at the time. The row keeps the natural key (issue, date): a new
 * decision adds a row and the history stays (SPEC §20 "rien ne se supprime"),
 * and `get` answers with the latest one.
 *
 * The frozen row has no `taken` column: the decision taken (`delegate` or
 * `keep-human`) is derived from `followed` and the recommendation cached for
 * the same ticket, read in one bounded query (see `mapping-advice.ts`).
 * CONTRACT-NEEDED: src/types-persistence.ts.DecisionRow.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { DecisionStore } from '../ports.js';
import type { Decision } from '../types-advice.js';
import type { DecisionRow, RecommendationRow } from '../types-persistence.js';
import { takenOf, toDecision, toDecisionRow } from './mapping-advice.js';
import { selectList, selectOne } from './rows.js';
import { projectScope } from './scope.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'decision';
const COLUMNS = ['issue_id', 'followed', 'actual_level', 'reason', 'at'] as const;
const KEY = ['issue_id', 'at'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_ISSUE = selectStatement(TABLE, COLUMNS, 'issue_id = ?', 'at DESC');
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'issue_id LIKE ?', 'at DESC');
const CACHED_VALUE = selectStatement('recommendation', ['value'], 'issue_id = ?');
/** The recommendations cached for the tickets of a project, in one read. */
const CACHED = selectStatement(
  'recommendation',
  ['issue_id', 'value'],
  'issue_id LIKE ?',
  'issue_id ASC',
);

/** The decision actually taken on a ticket (SPEC §8, DP-13). */
export function createDecisionStore(client: SqlClient): DecisionStore {
  async function cachedValue(issueId: string): Promise<string | null> {
    const row = await selectOne<RecommendationRow>(client, CACHED_VALUE, [issueId]);
    return row ? row.value : null;
  }

  async function cachedValues(projectId: string, limit: number): Promise<Map<string, string>> {
    const rows = await selectList<RecommendationRow>(
      client,
      CACHED,
      [projectScope(projectId)],
      limit,
    );
    return new Map(rows.map((row) => [row.issue_id, row.value]));
  }

  return {
    async get(issueId: string): Promise<Decision | null> {
      const row = await selectOne<DecisionRow>(client, BY_ISSUE, [issueId]);
      if (!row) return null;
      return toDecision(row, takenOf(row, await cachedValue(issueId)));
    },
    async save(decision: Decision): Promise<void> {
      const row = toDecisionRow(decision);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
    async listByProject(projectId: string, limit: number): Promise<Decision[]> {
      const rows = await selectList<DecisionRow>(
        client,
        BY_PROJECT,
        [projectScope(projectId)],
        limit,
      );
      const values = await cachedValues(projectId, limit);
      return rows.map((row) => toDecision(row, takenOf(row, values.get(row.issue_id) ?? null)));
    },
  };
}
