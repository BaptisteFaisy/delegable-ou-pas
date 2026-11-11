/**
 * Schema of the Forge SQL database (SPEC §18, SPEC §16.5, SPEC §16.6).
 *
 * Sixteen tables: the fourteen of SPEC §18, plus `settings` and `coverage`
 * that the screens demand. Column names are exactly the fields of the frozen
 * row types of `src/types-persistence.ts`, in `snake_case`.
 *
 * Forge SQL reality (SPEC §19): one GiB per installation, five seconds per
 * SELECT, no foreign keys, no `CREATE INDEX IF NOT EXISTS`. Consequences
 * applied here:
 * - every statement is `CREATE TABLE IF NOT EXISTS`, so the startup can replay
 *   the whole schema without error (idempotent DDL);
 * - indexes are declared inline, on the columns the stores filter by, so a
 *   read never scans a whole table;
 * - every primary key is the natural key of the row, so an upsert replaces
 *   instead of duplicating (nothing is ever deleted, SPEC §20).
 *
 * Sobriety (SPEC §17): `commit_fact` holds a fact — a mention was found or
 * not, and the agent name. The commit message is not a column and never will
 * be one.
 *
 * Anonymity (DP-17, SPEC §18 last line): no column of any table holds a person
 * identifier. `cohort_stat.people_count` is a count used only to mask a cohort
 * carried by too few people; it never names anybody.
 *
 * Types: booleans are `INT` holding 0/1, dates are `VARCHAR(32)` holding an
 * ISO 8601 UTC string (lexicographic order is chronological order, so an
 * `ORDER BY` on a date stays index-friendly and the round trip loses nothing),
 * JSON payloads are `TEXT` (SPEC §18: "JSON en TEXT").
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { TABLE_NAMES, type TableName } from '../types-persistence.js';

/** Involvement of each ticket, with its source (SPEC §5, §18, DP-01). */
const INVOLVEMENT = `CREATE TABLE IF NOT EXISTS involvement (
  issue_id VARCHAR(64) NOT NULL,
  level VARCHAR(16) NOT NULL,
  source VARCHAR(32) NOT NULL,
  client VARCHAR(64) NOT NULL,
  model VARCHAR(64) NOT NULL,
  session_ref VARCHAR(64) NOT NULL,
  evidence_json TEXT NOT NULL,
  decided_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (issue_id),
  INDEX idx_involvement_level (level)
)`;

/** Catalogue of commit mentions (SPEC §5, §18, DP-02). */
const SIGNATURE_PATTERN = `CREATE TABLE IF NOT EXISTS signature_pattern (
  id VARCHAR(64) NOT NULL,
  expression VARCHAR(255) NOT NULL,
  agent_name VARCHAR(64) NOT NULL,
  enabled INT NOT NULL,
  seen_count INT NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_signature_enabled (enabled)
)`;

/**
 * A commit fact: mention found or not, agent name, bot author, date
 * (SPEC §17, §18). The commit message is deliberately absent.
 */
const COMMIT_FACT = `CREATE TABLE IF NOT EXISTS commit_fact (
  issue_id VARCHAR(64) NOT NULL,
  commit_ref VARCHAR(128) NOT NULL,
  has_signature INT NOT NULL,
  agent_name VARCHAR(64) NOT NULL,
  author_is_bot INT NOT NULL,
  committed_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (issue_id, commit_ref),
  INDEX idx_commit_fact_agent (agent_name)
)`;

/** What the graph says of a pull request (SPEC §6, §18, DP-05). */
const REVIEW_FACT = `CREATE TABLE IF NOT EXISTS review_fact (
  issue_id VARCHAR(64) NOT NULL,
  pr_ref VARCHAR(128) NOT NULL,
  reviewer_count INT NOT NULL,
  changes_requested INT NOT NULL,
  comment_count INT NOT NULL,
  commits_after_open INT NOT NULL,
  opened_at VARCHAR(32) NOT NULL,
  merged_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (issue_id, pr_ref)
)`;

/** What happened to the ticket afterwards (SPEC §6, §18, DP-04). */
const OUTCOME = `CREATE TABLE IF NOT EXISTS outcome (
  issue_id VARCHAR(64) NOT NULL,
  closed_at VARCHAR(32) NOT NULL,
  lead_time_h DOUBLE NOT NULL,
  reopened INT NOT NULL,
  caused_bugs INT NOT NULL,
  neighbor_bugs INT NOT NULL,
  incidents INT NOT NULL,
  takeover INT NOT NULL,
  abandoned INT NOT NULL,
  clean INT NOT NULL,
  mature_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (issue_id),
  INDEX idx_outcome_mature (mature_at)
)`;

/** Nature, zone and size, kept by text fingerprint (SPEC §14 DP-06, §17). */
const ISSUE_CLASS = `CREATE TABLE IF NOT EXISTS issue_class (
  issue_id VARCHAR(64) NOT NULL,
  nature VARCHAR(64) NOT NULL,
  zone VARCHAR(64) NOT NULL,
  size VARCHAR(32) NOT NULL,
  classified_by VARCHAR(16) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  size_estimated INT NOT NULL,
  PRIMARY KEY (issue_id),
  INDEX idx_issue_class_hash (content_hash)
)`;

/** One period per agent setup (SPEC §7 rule 6, §18, DP-22). */
const EPOCH = `CREATE TABLE IF NOT EXISTS epoch (
  id VARCHAR(64) NOT NULL,
  project_id VARCHAR(64) NOT NULL,
  starts_at VARCHAR(32) NOT NULL,
  label VARCHAR(128) NOT NULL,
  client VARCHAR(64) NOT NULL,
  model VARCHAR(64) NOT NULL,
  instructions_version VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_epoch_project (project_id, starts_at)
)`;

/**
 * Cohort statistics, cached by the nightly job (SPEC §7, §18, DP-07, DP-08).
 * A statistics table: no person identifier lives here, only `people_count`,
 * used to mask a cohort that is too narrow (DP-17, SPEC §7 rule 8).
 */
const COHORT_STAT = `CREATE TABLE IF NOT EXISTS cohort_stat (
  project_id VARCHAR(64) NOT NULL,
  epoch_id VARCHAR(64) NOT NULL,
  nature VARCHAR(64) NOT NULL,
  zone VARCHAR(64) NOT NULL,
  size VARCHAR(32) NOT NULL,
  arm VARCHAR(16) NOT NULL,
  n INT NOT NULL,
  clean_rate DOUBLE NOT NULL,
  ci_low DOUBLE NOT NULL,
  ci_high DOUBLE NOT NULL,
  median_lead_h DOUBLE NOT NULL,
  review_load DOUBLE NOT NULL,
  people_count INT NOT NULL,
  conclusion VARCHAR(24) NOT NULL,
  computed_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (project_id, epoch_id, nature, zone, size, arm),
  INDEX idx_cohort_stat_computed (project_id, computed_at)
)`;

/** Recommendation cards, cached (SPEC §8, §18, §20, DP-11, DP-12). */
const RECOMMENDATION = `CREATE TABLE IF NOT EXISTS recommendation (
  issue_id VARCHAR(64) NOT NULL,
  value VARCHAR(32) NOT NULL,
  cohort_key TEXT NOT NULL,
  confidence VARCHAR(16) NOT NULL,
  reasons_json TEXT NOT NULL,
  refs_json TEXT NOT NULL,
  computed_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (issue_id),
  INDEX idx_recommendation_value (value, computed_at)
)`;

/**
 * The decision taken on a ticket (SPEC §8, §18, DP-13). The natural key is
 * (issue_id, at): a new decision adds a row, the history is kept (SPEC §20
 * "rien ne se supprime").
 */
const DECISION = `CREATE TABLE IF NOT EXISTS decision (
  issue_id VARCHAR(64) NOT NULL,
  followed INT NOT NULL,
  actual_level VARCHAR(16) NOT NULL,
  reason TEXT NOT NULL,
  at VARCHAR(32) NOT NULL,
  PRIMARY KEY (issue_id, at),
  INDEX idx_decision_project (issue_id)
)`;

/**
 * How right the past recommendations were (SPEC §10, §18, DP-21).
 * A statistics table: no person identifier (SPEC §18 last line).
 */
const CALIBRATION = `CREATE TABLE IF NOT EXISTS calibration (
  project_id VARCHAR(64) NOT NULL,
  epoch_id VARCHAR(64) NOT NULL,
  value VARCHAR(32) NOT NULL,
  n INT NOT NULL,
  clean_rate DOUBLE NOT NULL,
  ci_low DOUBLE NOT NULL,
  ci_high DOUBLE NOT NULL,
  PRIMARY KEY (project_id, epoch_id, value)
)`;

/** Controlled trials (SPEC §11, §18, DP-27). */
const TRIAL = `CREATE TABLE IF NOT EXISTS trial (
  id VARCHAR(64) NOT NULL,
  project_id VARCHAR(64) NOT NULL,
  cohort_key TEXT NOT NULL,
  starts_at VARCHAR(32) NOT NULL,
  ends_at VARCHAR(32) NOT NULL,
  state VARCHAR(16) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_trial_project (project_id, starts_at)
)`;

/** The draws of a trial (SPEC §11 step 3, §18, recipe 16). */
const TRIAL_ASSIGNMENT = `CREATE TABLE IF NOT EXISTS trial_assignment (
  trial_id VARCHAR(64) NOT NULL,
  issue_id VARCHAR(64) NOT NULL,
  arm VARCHAR(16) NOT NULL,
  complied INT NOT NULL,
  excluded_reason TEXT NOT NULL,
  PRIMARY KEY (trial_id, issue_id)
)`;

/** Where a collection stopped, per object type (SPEC §17, §18, DP-18). */
const GRAPH_CURSOR = `CREATE TABLE IF NOT EXISTS graph_cursor (
  project_id VARCHAR(64) NOT NULL,
  object_type VARCHAR(32) NOT NULL,
  last_issue_id VARCHAR(64) NOT NULL,
  last_run_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (project_id, object_type)
)`;

/** Project settings, adoption date and taxonomy (SPEC §16.5, §13). */
const SETTINGS = `CREATE TABLE IF NOT EXISTS settings (
  project_id VARCHAR(64) NOT NULL,
  project_key VARCHAR(32) NOT NULL,
  min_arm_size INT NOT NULL,
  adoption_date VARCHAR(32) NOT NULL,
  taxonomy_json TEXT NOT NULL,
  hardened_review_json TEXT NOT NULL,
  waiting_statuses_json TEXT NOT NULL,
  demo INT NOT NULL,
  updated_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (project_id)
)`;

/** Coverage screen: known involvement, graph rights (SPEC §16.6, §13, DP-19). */
const COVERAGE = `CREATE TABLE IF NOT EXISTS coverage (
  project_id VARCHAR(64) NOT NULL,
  known_issues INT NOT NULL,
  total_issues INT NOT NULL,
  permissions_json TEXT NOT NULL,
  last_collection_at VARCHAR(32) NOT NULL,
  last_collection_ok INT NOT NULL,
  demo INT NOT NULL,
  PRIMARY KEY (project_id)
)`;

/** One statement per table, keyed by the frozen table name. */
const STATEMENTS: Readonly<Record<TableName, string>> = {
  involvement: INVOLVEMENT,
  signature_pattern: SIGNATURE_PATTERN,
  commit_fact: COMMIT_FACT,
  review_fact: REVIEW_FACT,
  outcome: OUTCOME,
  issue_class: ISSUE_CLASS,
  epoch: EPOCH,
  cohort_stat: COHORT_STAT,
  recommendation: RECOMMENDATION,
  decision: DECISION,
  calibration: CALIBRATION,
  trial: TRIAL,
  trial_assignment: TRIAL_ASSIGNMENT,
  graph_cursor: GRAPH_CURSOR,
  settings: SETTINGS,
  coverage: COVERAGE,
};

/** Every creation statement, in the order of `TABLE_NAMES` (SPEC §18 first). */
export const DDL: readonly string[] = TABLE_NAMES.map((table) => STATEMENTS[table]);

/** The creation statement of one table; idempotent, so it can be replayed. */
export function ddlFor(table: TableName): string {
  return STATEMENTS[table];
}
