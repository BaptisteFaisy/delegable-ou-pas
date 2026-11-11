/**
 * Contract test of the schema (SPEC §18, SPEC §16.5, SPEC §16.6, DP-17).
 *
 * The expected columns are not written by hand: each one is a typed sample of
 * the frozen row of `src/types-persistence.ts`, so the compiler itself is
 * what ties this test to the contract. If a row of the contract gains or
 * loses a field, this file stops compiling.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { describe, expect, it } from 'vitest';
import { createMemorySql } from '../../src/db/memory-sql.js';
import { parseCreateTable } from '../../src/db/memory-sql-parse.js';
import { DDL, ddlFor } from '../../src/db/schema.js';
import type {
  CalibrationRowDb,
  CommitFactRow,
  CohortStatRow,
  CoverageRow,
  DecisionRow,
  EpochRow,
  GraphCursorRow,
  InvolvementRow,
  IssueClassRow,
  OutcomeRow,
  RecommendationRow,
  ReviewFactRow,
  SettingsRow,
  SignaturePatternRow,
  TableName,
  TrialAssignmentRow,
  TrialRow,
} from '../../src/types-persistence.js';
import { SPEC_TABLES, TABLE_NAMES } from '../../src/types-persistence.js';

/* ------------------------------------------------------- frozen row samples */

const INVOLVEMENT: InvolvementRow = {
  issue_id: 'PROJ-1',
  level: 'driven',
  source: 'mcp-declaration',
  client: 'forge-cli',
  model: 'model-a',
  session_ref: 'session-1',
  evidence_json: '[]',
  decided_at: '2026-11-01T09:00:00.000Z',
};

const SIGNATURE: SignaturePatternRow = {
  id: 'pat-1',
  expression: 'Co-authored-by: Agent A',
  agent_name: 'agent-a',
  enabled: 1,
  seen_count: 3,
};

const COMMIT: CommitFactRow = {
  issue_id: 'PROJ-1',
  commit_ref: 'sha-1',
  has_signature: 1,
  agent_name: 'agent-a',
  author_is_bot: 1,
  committed_at: '2026-11-01T09:00:00.000Z',
};

const REVIEW: ReviewFactRow = {
  issue_id: 'PROJ-1',
  pr_ref: 'pr-1',
  reviewer_count: 2,
  changes_requested: 1,
  comment_count: 4,
  commits_after_open: 2,
  opened_at: '2026-11-01T09:00:00.000Z',
  merged_at: '',
};

const OUTCOME: OutcomeRow = {
  issue_id: 'PROJ-1',
  closed_at: '2026-11-02T09:00:00.000Z',
  lead_time_h: 26.5,
  reopened: 0,
  caused_bugs: 0,
  neighbor_bugs: 1,
  incidents: 0,
  takeover: 0,
  abandoned: 0,
  clean: 1,
  mature_at: '2027-01-01T09:00:00.000Z',
};

const ISSUE_CLASS: IssueClassRow = {
  issue_id: 'PROJ-1',
  nature: 'migration',
  zone: 'billing',
  size: 'M',
  classified_by: 'model',
  content_hash: 'hash-1',
  size_estimated: 0,
};

const EPOCH: EpochRow = {
  id: 'ep-1',
  project_id: 'PROJ',
  starts_at: '2026-09-14T00:00:00.000Z',
  label: 'new model',
  client: 'forge-cli',
  model: 'model-a',
  instructions_version: 'v3',
};

const COHORT: CohortStatRow = {
  project_id: 'PROJ',
  epoch_id: 'ep-1',
  nature: 'migration',
  zone: 'billing',
  size: 'M',
  arm: 'agent',
  n: 26,
  clean_rate: 0.69,
  ci_low: 0.5,
  ci_high: 0.84,
  median_lead_h: 36,
  review_load: 1.4,
  people_count: 4,
  conclusion: 'same',
  computed_at: '2026-11-01T09:00:00.000Z',
};

const RECOMMENDATION: RecommendationRow = {
  issue_id: 'PROJ-1',
  value: 'delegate-with-review',
  cohort_key: '{}',
  confidence: 'medium',
  reasons_json: '[]',
  refs_json: '[]',
  computed_at: '2026-11-01T09:00:00.000Z',
};

const DECISION: DecisionRow = {
  issue_id: 'PROJ-1',
  followed: 1,
  actual_level: 'driven',
  reason: 'criteria present',
  at: '2026-11-01T09:00:00.000Z',
};

const CALIBRATION: CalibrationRowDb = {
  project_id: 'PROJ',
  epoch_id: 'ep-1',
  value: 'delegate-with-review',
  n: 18,
  clean_rate: 0.72,
  ci_low: 0.5,
  ci_high: 0.88,
};

const TRIAL: TrialRow = {
  id: 'trial-1',
  project_id: 'PROJ',
  cohort_key: '{}',
  starts_at: '2026-11-01T00:00:00.000Z',
  ends_at: '2026-12-01T00:00:00.000Z',
  state: 'running',
};

const ASSIGNMENT: TrialAssignmentRow = {
  trial_id: 'trial-1',
  issue_id: 'PROJ-1',
  arm: 'agent',
  complied: 1,
  excluded_reason: '',
};

const CURSOR: GraphCursorRow = {
  project_id: 'PROJ',
  object_type: 'commit',
  last_issue_id: 'PROJ-1',
  last_run_at: '2026-11-01T09:00:00.000Z',
};

const SETTINGS: SettingsRow = {
  project_id: 'PROJ',
  project_key: 'PROJ',
  min_arm_size: 20,
  adoption_date: '2026-01-15',
  taxonomy_json: '{}',
  hardened_review_json: '{}',
  waiting_statuses_json: '[]',
  demo: 0,
  updated_at: '2026-11-01T09:00:00.000Z',
};

const COVERAGE: CoverageRow = {
  project_id: 'PROJ',
  known_issues: 42,
  total_issues: 60,
  permissions_json: '[]',
  last_collection_at: '2026-11-01T09:00:00.000Z',
  last_collection_ok: 1,
  demo: 0,
};

/** One typed sample per table: the compiler ties it to the frozen contract. */
const ROW_SAMPLES: Readonly<Record<TableName, object>> = {
  involvement: INVOLVEMENT,
  signature_pattern: SIGNATURE,
  commit_fact: COMMIT,
  review_fact: REVIEW,
  outcome: OUTCOME,
  issue_class: ISSUE_CLASS,
  epoch: EPOCH,
  cohort_stat: COHORT,
  recommendation: RECOMMENDATION,
  decision: DECISION,
  calibration: CALIBRATION,
  trial: TRIAL,
  trial_assignment: ASSIGNMENT,
  graph_cursor: CURSOR,
  settings: SETTINGS,
  coverage: COVERAGE,
};

/* ------------------------------------------------------------------ anonymity */

/**
 * Column names that would identify a person (DP-17, SPEC §18 last line,
 * recipe 12). `agent_name` is not one: it names a tool, and `author_is_bot`
 * is a fact about an account, not an identifier.
 */
const PERSON_COLUMNS = new Set([
  'account',
  'account_id',
  'user',
  'user_id',
  'user_name',
  'username',
  'email',
  'assignee',
  'assignee_id',
  'reporter',
  'reporter_id',
  'reviewer',
  'reviewer_id',
  'author',
  'author_id',
  'owner',
  'owner_id',
  'member',
  'member_id',
  'person',
  'person_id',
  'developer',
  'developer_id',
  'actor',
  'actor_id',
  'display_name',
]);

/** Anything that looks like an identifier of a person, in a statistics table. */
const PERSON_PATTERN =
  /(^|_)(account|user|email|assignee|reporter|reviewer|owner|member|person|developer|actor)(_|$)/i;

/** The statistics tables of SPEC §18: figures about cohorts, never people. */
const STATISTICS_TABLES: readonly TableName[] = ['cohort_stat', 'calibration'];

function columnsOf(table: TableName): string[] {
  return [...parseCreateTable(ddlFor(table)).columns];
}

/* -------------------------------------------------------------------- tests */

describe('schema (SPEC §18)', () => {
  it('declares one creation statement per table, in the order of the contract', () => {
    expect(DDL).toHaveLength(TABLE_NAMES.length);
    DDL.forEach((statement, index) => {
      expect(parseCreateTable(statement).name).toBe(TABLE_NAMES[index]);
    });
  });

  it('creates each table of SPEC §18', () => {
    for (const table of SPEC_TABLES) {
      expect(ddlFor(table)).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(SPEC_TABLES).toHaveLength(14);
  });

  it('also creates the two tables the screens demand (SPEC §16.5, §16.6)', () => {
    expect(ddlFor('settings')).toContain('CREATE TABLE IF NOT EXISTS settings');
    expect(ddlFor('coverage')).toContain('CREATE TABLE IF NOT EXISTS coverage');
  });

  it.each(TABLE_NAMES)('declares exactly the columns of the frozen row of %s', (table) => {
    const expected = Object.keys(ROW_SAMPLES[table]).sort();
    expect(columnsOf(table).sort()).toEqual(expected);
  });

  it('is idempotent: every statement can be replayed', () => {
    for (const table of TABLE_NAMES) {
      expect(ddlFor(table)).toMatch(/CREATE TABLE IF NOT EXISTS/i);
    }
  });

  it('keeps its rows when the schema is replayed', async () => {
    const sql = createMemorySql();
    for (const statement of DDL) await sql.execute(statement);
    sql.seed('involvement', [{ ...INVOLVEMENT }]);
    for (const statement of DDL) await sql.execute(statement);
    expect(sql.rowsOf('involvement')).toHaveLength(1);
    expect(sql.tables.size).toBe(TABLE_NAMES.length);
  });

  it('declares a natural key on every table, so an upsert replaces', () => {
    for (const table of TABLE_NAMES) {
      expect(parseCreateTable(ddlFor(table)).primaryKey.length).toBeGreaterThan(0);
    }
  });
});

describe('sobriety of the schema (SPEC §17)', () => {
  it('never stores a commit message', () => {
    const forbidden = /message|body|subject|description|quote|patch|diff/i;
    for (const table of TABLE_NAMES) {
      for (const column of columnsOf(table)) {
        expect(column, `${table}.${column}`).not.toMatch(forbidden);
      }
    }
  });

  it('keeps only the fact on a commit: mention found, and agent name', () => {
    expect(columnsOf('commit_fact')).toEqual([
      'issue_id',
      'commit_ref',
      'has_signature',
      'agent_name',
      'author_is_bot',
      'committed_at',
    ]);
  });
});

describe('anonymity of the schema (DP-17, SPEC §18 last line)', () => {
  it('holds no person identifier in any table', () => {
    for (const table of TABLE_NAMES) {
      for (const column of columnsOf(table)) {
        expect(PERSON_COLUMNS.has(column.toLowerCase()), `${table}.${column}`).toBe(false);
      }
    }
  });

  it('holds nothing that even looks like a person in the statistics tables', () => {
    for (const table of STATISTICS_TABLES) {
      for (const column of columnsOf(table)) {
        expect(column, `${table}.${column}`).not.toMatch(PERSON_PATTERN);
      }
    }
  });

  it('keeps people_count as a bare count, used only to mask a narrow cohort', () => {
    const columns = columnsOf('cohort_stat');
    expect(columns).toContain('people_count');
    expect(columns.filter((column) => /people|count/i.test(column))).toEqual([
      'people_count',
      'reviewer_count',
    ].filter((column) => columns.includes(column)));
  });
});
