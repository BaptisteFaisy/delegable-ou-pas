/**
 * Domain contract — one row type per table of SPEC §18 (Forge SQL).
 *
 * Column names follow the SPEC exactly, in `snake_case`; JSON columns are kept
 * as strings, because that is what the database holds. Turning a row into a
 * domain object and back is the job of the mapping layer of lot L5
 * (`src/db/mapping.ts`, SPEC §17, DP-18, DP-19).
 *
 * SPEC §18, last line, is a hard rule: `people_count` only hides cohorts that
 * are too narrow, and **no statistics table holds a person identifier**
 * (SPEC §7 rule 8, DP-17, recipe 12).
 *
 * Two tables are not in the SPEC §18 list but the screens demand them:
 * `settings` (SPEC §16.5) and `coverage` (SPEC §16.6, DP-19). They are declared
 * here so lot L5 creates them in the same schema.
 */
import type {
  Arm,
  ClassifiedBy,
  Conclusion,
  GraphObjectType,
  Level,
  Source,
} from './types.js';
import type { Confidence, Recommendation, TrialState } from './types-advice.js';

/** The tables of SPEC §18, plus the two the screens demand (SPEC §16.5, §16.6). */
export type TableName =
  | 'involvement'
  | 'signature_pattern'
  | 'commit_fact'
  | 'review_fact'
  | 'outcome'
  | 'issue_class'
  | 'epoch'
  | 'cohort_stat'
  | 'recommendation'
  | 'decision'
  | 'calibration'
  | 'trial'
  | 'trial_assignment'
  | 'graph_cursor'
  | 'settings'
  | 'coverage';

/** Every table name, SPEC §18 order then the two additions. */
export const TABLE_NAMES: readonly TableName[] = [
  'involvement',
  'signature_pattern',
  'commit_fact',
  'review_fact',
  'outcome',
  'issue_class',
  'epoch',
  'cohort_stat',
  'recommendation',
  'decision',
  'calibration',
  'trial',
  'trial_assignment',
  'graph_cursor',
  'settings',
  'coverage',
];

/** The tables of SPEC §18 only, in the order of the SPEC table. */
export const SPEC_TABLES: readonly TableName[] = TABLE_NAMES.slice(0, 14);

/* ---------------------------------------------------------------- involvement */

/** Row of `involvement` (SPEC §18, SPEC §5, DP-01). */
export interface InvolvementRow {
  issue_id: string;
  level: Level;
  source: Source;
  client: string;
  model: string;
  session_ref: string;
  /** JSON array of evidence keys; never a free-text quote (SPEC §17). */
  evidence_json: string;
  decided_at: string;
}

/* ----------------------------------------------------------- signature_pattern */

/** Row of `signature_pattern` (SPEC §18, SPEC §5 "Les mentions de commit", DP-02). */
export interface SignaturePatternRow {
  id: string;
  expression: string;
  agent_name: string;
  enabled: number;
  seen_count: number;
}

/* --------------------------------------------------------------- commit_fact */

/**
 * Row of `commit_fact` (SPEC §18, SPEC §17 "Ce que l'app conserve").
 *
 * The commit message is not a column and must never become one.
 */
export interface CommitFactRow {
  issue_id: string;
  commit_ref: string;
  has_signature: number;
  agent_name: string;
  author_is_bot: number;
  committed_at: string;
}

/* --------------------------------------------------------------- review_fact */

/** Row of `review_fact` (SPEC §18, SPEC §6 "Relecture", DP-05). */
export interface ReviewFactRow {
  issue_id: string;
  pr_ref: string;
  reviewer_count: number;
  changes_requested: number;
  comment_count: number;
  commits_after_open: number;
  opened_at: string;
  merged_at: string;
}

/* -------------------------------------------------------------------- outcome */

/** Row of `outcome` (SPEC §18, SPEC §6, DP-04). */
export interface OutcomeRow {
  issue_id: string;
  closed_at: string;
  lead_time_h: number;
  reopened: number;
  caused_bugs: number;
  neighbor_bugs: number;
  incidents: number;
  takeover: number;
  abandoned: number;
  clean: number;
  mature_at: string;
}

/* --------------------------------------------------------------- issue_class */

/** Row of `issue_class` (SPEC §18, SPEC §14 DP-06). */
export interface IssueClassRow {
  issue_id: string;
  nature: string;
  zone: string;
  size: string;
  classified_by: ClassifiedBy;
  content_hash: string;
  /** True when the size was estimated instead of measured (SPEC §19). */
  size_estimated: number;
}

/* ---------------------------------------------------------------------- epoch */

/** Row of `epoch` (SPEC §18, SPEC §7 rule 6, DP-22). */
export interface EpochRow {
  id: string;
  project_id: string;
  starts_at: string;
  label: string;
  client: string;
  model: string;
  instructions_version: string;
}

/* --------------------------------------------------------------- cohort_stat */

/**
 * Row of `cohort_stat` (SPEC §18, SPEC §7, DP-07, DP-08).
 *
 * `people_count` is only used to mask a cohort carried by fewer than three
 * people (SPEC §7 rule 8, DP-17, recipe 11). No person identifier lives here.
 */
export interface CohortStatRow {
  project_id: string;
  epoch_id: string;
  nature: string;
  zone: string;
  size: string;
  arm: Arm;
  n: number;
  clean_rate: number;
  ci_low: number;
  ci_high: number;
  median_lead_h: number;
  review_load: number;
  people_count: number;
  conclusion: Conclusion;
  computed_at: string;
}

/* ------------------------------------------------------------- recommendation */

/** Row of `recommendation` (SPEC §18, SPEC §8, DP-11, DP-12). */
export interface RecommendationRow {
  issue_id: string;
  value: Recommendation;
  /** Serialized `CohortKey` (SPEC §18 `cohort_key`). */
  cohort_key: string;
  confidence: Confidence;
  /** JSON array of reasons (SPEC §8). */
  reasons_json: string;
  /** JSON array of reference issue keys (SPEC §4 "Fondement"). */
  refs_json: string;
  computed_at: string;
}

/* ------------------------------------------------------------------- decision */

/** Row of `decision` (SPEC §18, SPEC §8 "Un avis, pas un ordre", DP-13). */
export interface DecisionRow {
  issue_id: string;
  followed: number;
  actual_level: Level;
  reason: string;
  at: string;
}

/* ---------------------------------------------------------------- calibration */

/**
 * Row of `calibration` (SPEC §18, SPEC §10, DP-21).
 *
 * A statistics row: it holds no person identifier (SPEC §18 last line).
 */
export interface CalibrationRowDb {
  project_id: string;
  epoch_id: string;
  value: Recommendation;
  n: number;
  clean_rate: number;
  ci_low: number;
  ci_high: number;
}

/* ---------------------------------------------------------------------- trial */

/** Row of `trial` (SPEC §18, SPEC §11, DP-27). */
export interface TrialRow {
  id: string;
  project_id: string;
  /** Serialized `CohortKey` (SPEC §18 `cohort_key`). */
  cohort_key: string;
  starts_at: string;
  ends_at: string;
  state: TrialState;
}

/** Row of `trial_assignment` (SPEC §18, SPEC §11 step 3, recipe 16). */
export interface TrialAssignmentRow {
  trial_id: string;
  issue_id: string;
  arm: Arm;
  complied: number;
  excluded_reason: string;
}

/* -------------------------------------------------------------- graph_cursor */

/** Row of `graph_cursor` (SPEC §18, SPEC §17 "Ce qu'impose le graphe", DP-18). */
export interface GraphCursorRow {
  project_id: string;
  object_type: GraphObjectType;
  last_issue_id: string;
  last_run_at: string;
}

/* ------------------------------------------------------- additions (écrans) */

/**
 * Row of `settings` (SPEC §16.5 "Réglages du projet", SPEC §13 "La date d'adoption").
 *
 * Not listed in SPEC §18, but the settings screen and the adoption date need a
 * home; lot L5 creates it with the others.
 */
export interface SettingsRow {
  project_id: string;
  project_key: string;
  min_arm_size: number;
  adoption_date: string;
  /** JSON of natures, zones, sizes and sensitive zones (SPEC §16.5). */
  taxonomy_json: string;
  /** JSON of the strengthened review definition (SPEC §8). */
  hardened_review_json: string;
  /** JSON of waiting statuses (SPEC §6 "Délai"). */
  waiting_statuses_json: string;
  demo: number;
  updated_at: string;
}

/**
 * Row of `coverage` (SPEC §16.6 "Couverture", SPEC §13, DP-19).
 *
 * Not listed in SPEC §18, but the coverage screen needs one row per project.
 */
export interface CoverageRow {
  project_id: string;
  known_issues: number;
  total_issues: number;
  /** JSON of the state of every right on the graph, per object type (SPEC §19). */
  permissions_json: string;
  last_collection_at: string;
  last_collection_ok: number;
  demo: number;
}
