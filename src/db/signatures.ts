/**
 * Signature store (SPEC §5 "Les mentions de commit", SPEC §18 table
 * `signature_pattern`, DP-02).
 *
 * The catalogue of commit mentions is small and bounded, so its reads carry a
 * `LIMIT` like every other list (SPEC §19). `listSeen` answers with what was
 * really seen on the team's commits: the count comes from the catalogue, and
 * the date of the last mention comes from `commit_fact`, the only place a
 * "seen" instant is stored — the commit message itself is never kept
 * (SPEC §17).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { SignatureStore } from '../ports.js';
import type { SignaturePattern } from '../types.js';
import type { SeenSignature } from '../types-graph.js';
import type { SignaturePatternRow } from '../types-persistence.js';
import { asText } from './mapping-codec.js';
import { toSeenSignature, toSignaturePattern, toSignaturePatternRow } from './mapping-involvement.js';
import { selectAggregate, selectList } from './rows.js';
import type { SqlClient } from './sql-client.js';
import {
  incrementStatement,
  rowParameters,
  selectStatement,
  upsertStatement,
} from './sql-builders.js';

const TABLE = 'signature_pattern';
const COLUMNS = ['id', 'expression', 'agent_name', 'enabled', 'seen_count'] as const;
const KEY = ['id'] as const;

const UPSERT = upsertStatement(TABLE, COLUMNS, KEY);
const ALL = selectStatement(TABLE, COLUMNS, 'id IS NOT NULL', 'id ASC');
const ENABLED = selectStatement(TABLE, COLUMNS, 'enabled = ?', 'id ASC');
const SEEN = selectStatement(TABLE, COLUMNS, 'seen_count > ?', 'seen_count DESC, id ASC');
const RECORD_SEEN = incrementStatement(TABLE, 'seen_count', 'id = ?');
/** The date of the last commit that carried a mention of this agent. */
const LAST_SEEN =
  'SELECT MAX(committed_at) AS last_seen_at FROM commit_fact WHERE agent_name = ?';

/** The tunable catalogue of commit mentions (SPEC §5, DP-02). */
export function createSignatureStore(client: SqlClient): SignatureStore {
  return {
    async list(): Promise<SignaturePattern[]> {
      const rows = await selectList<SignaturePatternRow>(client, ALL, []);
      return rows.map((row) => toSignaturePattern(row));
    },
    async listEnabled(): Promise<SignaturePattern[]> {
      const rows = await selectList<SignaturePatternRow>(client, ENABLED, [1]);
      return rows.map((row) => toSignaturePattern(row));
    },
    async save(pattern: SignaturePattern): Promise<void> {
      const row = toSignaturePatternRow(pattern);
      await client.execute(UPSERT, rowParameters(row, COLUMNS));
    },
    async recordSeen(_patternId: string, _at: string): Promise<void> {
      // The frozen row has no `last_seen_at` column, so only the counter is
      // kept here; the date is read back from `commit_fact` by `listSeen`.
      // CONTRACT-NEEDED: src/types-persistence.ts.SignaturePatternRow.
      await client.execute(RECORD_SEEN, [1, _patternId]);
    },
    async listSeen(limit: number): Promise<SeenSignature[]> {
      const rows = await selectList<SignaturePatternRow>(client, SEEN, [0], limit);
      const seen: SeenSignature[] = [];
      for (const row of rows) {
        const last = await selectAggregate<{ last_seen_at: string | null }>(client, LAST_SEEN, [
          row.agent_name,
        ]);
        seen.push(toSeenSignature(row, asText(last?.last_seen_at)));
      }
      return seen;
    },
  };
}
