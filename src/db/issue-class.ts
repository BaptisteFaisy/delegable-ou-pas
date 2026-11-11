/**
 * Issue class store (SPEC §14 DP-06, SPEC §17, SPEC §18 table `issue_class`).
 *
 * Nature, zone and size of a ticket, kept by fingerprint of the text they
 * were read from: `getByContentHash` hands back a classification already
 * made for the same text, so the same ticket is never classified twice and
 * the model is not called again (SPEC §17 "conservées par empreinte").
 *
 * SPEC §21 ("ticket déplacé de projet"): the ticket keeps its row — nothing
 * is deleted — and its cohort changes with its new classification.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { IssueClassStore } from '../ports.js';
import type { IssueClass } from '../types.js';
import type { IssueClassRow } from '../types-persistence.js';
import { toIssueClass, toIssueClassRow } from './mapping-stats.js';
import { selectList, selectOne } from './rows.js';
import { projectScope } from './scope.js';
import type { SqlClient } from './sql-client.js';
import { rowParameters, selectStatement, upsertStatement } from './sql-builders.js';

const TABLE = 'issue_class';
const COLUMNS = [
  'issue_id',
  'nature',
  'zone',
  'size',
  'classified_by',
  'content_hash',
  'size_estimated',
] as const;
const KEY = ['issue_id'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const BY_ISSUE = selectStatement(TABLE, COLUMNS, 'issue_id = ?');
const BY_PROJECT = selectStatement(TABLE, COLUMNS, 'issue_id LIKE ?', 'issue_id ASC');
const BY_HASH = selectStatement(
  TABLE,
  COLUMNS,
  'issue_id LIKE ? AND content_hash = ?',
  'issue_id ASC',
);

/** Nature, zone and size, kept by text fingerprint (SPEC §14 DP-06). */
export function createIssueClassStore(client: SqlClient): IssueClassStore {
  return {
    async get(issueId: string): Promise<IssueClass | null> {
      const row = await selectOne<IssueClassRow>(client, BY_ISSUE, [issueId]);
      return row ? toIssueClass(row) : null;
    },
    async save(issueClass: IssueClass): Promise<void> {
      const row = toIssueClassRow(issueClass);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
    async listByProject(projectId: string, limit: number): Promise<IssueClass[]> {
      const rows = await selectList<IssueClassRow>(
        client,
        BY_PROJECT,
        [projectScope(projectId)],
        limit,
      );
      return rows.map((row) => toIssueClass(row));
    },
    async getByContentHash(projectId: string, contentHash: string): Promise<IssueClass | null> {
      const row = await selectOne<IssueClassRow>(client, BY_HASH, [
        projectScope(projectId),
        contentHash,
      ]);
      return row ? toIssueClass(row) : null;
    },
  };
}
