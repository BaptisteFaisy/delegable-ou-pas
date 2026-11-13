/**
 * Domain contract — the measured vocabulary of « Délégable ou pas ? »
 * (SPEC §4 vocabulary, §5 sources, §6 measures, §7 comparison, §13 adoption).
 *
 * Every lot owns its own files but nobody owns these ones: changing a type here
 * is a contract change, done in a dedicated pull request whose body carries
 * `CONTRACT-CHANGE` and announced in docs/CONTRACTS.md.
 *
 * Companion contract files (same rules, same conventions):
 * - `src/types-advice.ts`      — what the app decides: recommendation, decision,
 *   calibration, trial, coverage, settings, delegation map (SPEC §8…§16);
 * - `src/types-graph.ts`        — raw collection facts (commits, PRs, reviewers, status history, links);
 * - `src/types-mcp.ts`          — inputs and outputs of the nine MCP tools (SPEC §15);
 * - `src/types-persistence.ts`  — one row type per table of SPEC §18.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/* ------------------------------------------------------------------ levels */

/**
 * The five levels of agent involvement (SPEC §5, table "Les cinq niveaux"),
 * in the order of the SPEC.
 */
export type Level = 'none' | 'assisted' | 'driven' | 'autonomous' | 'unknown';

/** The five levels, SPEC order (SPEC §5). */
export const LEVELS: readonly Level[] = [
  'none',
  'assisted',
  'driven',
  'autonomous',
  'unknown',
];

/**
 * Rank of each level on the scale (SPEC §7 rule 4).
 *
 * `unknown` sits below `none` on purpose: it is not a level of the scale, it
 * is the absence of evidence, and it never counts as "without agent"
 * (SPEC §5, DP-03, recipe 2).
 */
export const LEVEL_ORDER: Readonly<Record<Level, number>> = {
  none: 0,
  assisted: 1,
  driven: 2,
  autonomous: 3,
  unknown: -1,
};

/** True when the level means an agent did take part (SPEC §5). */
export const LEVEL_HAS_AGENT: Readonly<Record<Level, boolean>> = {
  none: false,
  assisted: true,
  driven: true,
  autonomous: true,
  unknown: false,
};

/* ----------------------------------------------------------------- sources */

/**
 * The five sources of involvement, safest first (SPEC §5, table "Cinq sources").
 * The app keeps the best available one and displays it (SPEC §5, DP-01).
 */
export type Source =
  | 'mcp-declaration'
  | 'bot-author'
  | 'commit-mention'
  | 'closure-field'
  | 'adoption-date';

/** The five sources, SPEC order (SPEC §5). */
export const SOURCES: readonly Source[] = [
  'mcp-declaration',
  'bot-author',
  'commit-mention',
  'closure-field',
  'adoption-date',
];

/** Rank of each source, 1 = safest (SPEC §5). */
export const SOURCE_ORDER: Readonly<Record<Source, number>> = {
  'mcp-declaration': 1,
  'bot-author': 2,
  'commit-mention': 3,
  'closure-field': 4,
  'adoption-date': 5,
};

/* ------------------------------------------------------------- involvement */

/**
 * The involvement of one ticket, with the source it was read from
 * (SPEC §18 table `involvement`, DP-01).
 */
export interface Involvement {
  issueId: string;
  level: Level;
  source: Source;
  /** Tool that declared the involvement, when known (SPEC §5, SPEC §15). */
  client: string;
  /** Model used by the agent, when known (SPEC §5). */
  model: string;
  /** Session reference of the declaration, when known (SPEC §15). */
  sessionRef: string;
  /** Structured evidence keys, never a free-text quote (SPEC §17). */
  evidence: readonly string[];
  decidedAt: string;
}

/** One candidate level found by one source, before arbitration (SPEC §5). */
export interface SourceCandidate {
  source: Source;
  level: Level;
  /** What the source proves, in short: a key or a count, never a person (SPEC §17, §20). */
  evidence: string;
}

/**
 * A signature pattern of the tunable commit-mention catalogue
 * (SPEC §5 "Les mentions de commit", SPEC §18 table `signature_pattern`, DP-02).
 */
export interface SignaturePattern {
  id: string;
  /** Regular expression matched against a commit message. */
  expression: string;
  /** Agent name published by the pattern (SPEC §18 `agent_name`). */
  agentName: string;
  enabled: boolean;
  /** How many times the pattern was actually seen (SPEC §18 `seen_count`, DP-02). */
  seenCount: number;
}

/** The result of matching a commit message against the catalogue (SPEC §5). */
export interface SignatureMatch {
  found: boolean;
  /** Agent name read in the mention; empty when none was found. */
  agentName: string;
  /** Id of the pattern that matched; empty when none matched. */
  patternId: string;
}

/* ------------------------------------------------------------------- facts */

/**
 * What the app keeps of a commit (SPEC §17 "Ce que l'app conserve",
 * SPEC §18 table `commit_fact`).
 *
 * The commit message itself is never stored: only "mention found or not" and
 * the agent name (SPEC §17).
 */
export interface CommitFact {
  issueId: string;
  commitRef: string;
  /** True when a signature mention was found in the message (SPEC §5). */
  hasSignature: boolean;
  /** Agent name read in the mention; empty when none was found (SPEC §17). */
  agentName: string;
  /** True when the commit author is a robot account (SPEC §5, source 2). */
  authorIsBot: boolean;
  committedAt: string;
}

/**
 * What the app keeps of a pull request (SPEC §6 "Relecture",
 * SPEC §18 table `review_fact`).
 *
 * The graph gives the *current* opinion of each reviewer, never the number of
 * round trips: the load is approximated by comments and commits added after
 * the PR was opened (SPEC §6, SPEC §19).
 */
export interface ReviewFact {
  issueId: string;
  prRef: string;
  reviewerCount: number;
  changesRequested: number;
  commentCount: number;
  commitsAfterOpen: number;
  openedAt: string;
  /** Empty while the PR is still open. */
  mergedAt: string;
}

/**
 * What happened to a ticket afterwards (SPEC §6 "Mesurer ce qui arrive ensuite",
 * SPEC §18 table `outcome`).
 */
export interface Outcome {
  issueId: string;
  /** Empty while the ticket is still open. */
  closedAt: string;
  /** Delay in hours, from the first "in progress" to closure, excluding waiting statuses (SPEC §6). */
  leadTimeH: number;
  /** Reopened within 30 days (SPEC §6 "Réouverture"). */
  reopened: boolean;
  /** Bugs linked by a "is caused by" link within 60 days (SPEC §6 "Bug à la suite"). */
  causedBugs: number;
  /** Bugs created within 30 days on the same component, quoting the ticket (SPEC §6 "Bug voisin"). */
  neighborBugs: number;
  /** Incidents linked to the ticket (SPEC §6 "Incident"). */
  incidents: number;
  /** A ticket started autonomous, finished driven or taken over by someone else (SPEC §6 "Reprise humaine"). */
  takeover: boolean;
  /** Cancelled after it had started (SPEC §6 "Abandon"). */
  abandoned: boolean;
  /** Closed without reopening, without a following bug and without an incident within 60 days (SPEC §6). */
  clean: boolean;
  /** Date at which the ticket became judgeable (30 days for a reopening, 60 for a clean closure) (SPEC §6). */
  matureAt: string;
}

/* ------------------------------------------------------------ classification */

/**
 * The kind of work of a ticket (SPEC §4 "Nature").
 *
 * A free string, because every project declares its own natures
 * (SPEC §16.5 "Réglages du projet").
 */
export type Nature = string;

/** The kinds of work listed in SPEC §4, as defaults for a new project. */
export const DEFAULT_NATURES: readonly Nature[] = [
  'bugfix',
  'ui-change',
  'data-migration',
  'refactor',
  'tests',
  'configuration',
  'external-integration',
];

/**
 * The reserved nature for work with no commit (documentation, configuration
 * files): such tickets stay out of the code cohorts (SPEC §21).
 */
export const NATURE_NO_CODE = 'no-code';

/** Who classified a ticket (SPEC §14 DP-06: rules first, then the Forge model). */
export type ClassifiedBy = 'rules' | 'model' | 'manual';

/** The three ways a classification can be obtained (SPEC §14 DP-06). */
export const CLASSIFIED_BY: readonly ClassifiedBy[] = ['rules', 'model', 'manual'];

/**
 * The classification of one ticket: kind of work, zone and size
 * (SPEC §14 DP-06, SPEC §16.5, SPEC §18 table `issue_class`).
 */
export interface IssueClass {
  issueId: string;
  nature: Nature;
  zone: Zone;
  size: Size;
  classifiedBy: ClassifiedBy;
  /** Fingerprint of the text the classification was made from, so the result is kept (SPEC §17). */
  contentHash: string;
  /** True when the size was estimated instead of measured (SPEC §19). */
  sizeEstimated: boolean;
}

/** A zone of the codebase, as declared by the project (SPEC §16.5). */
export type Zone = string;

/** A ticket size, as declared by the project (SPEC §16.5). */
export type Size = string;

/* ------------------------------------------------------------------ cohorts */

/**
 * How deep a cohort is (SPEC §7 rule 1): when a cohort is too small, the app
 * goes one level up — nature and size, all zones — and says so.
 */
export type CohortLevel = 'nature-zone-size' | 'nature-size' | 'nature';

/** The three cohort levels, from the most precise to the broadest (SPEC §7 rule 1). */
export const COHORT_LEVELS: readonly CohortLevel[] = [
  'nature-zone-size',
  'nature-size',
  'nature',
];

/** The level used when the previous one is too small; empty at the top (SPEC §7 rule 1). */
export const COHORT_FALLBACK: Readonly<Record<CohortLevel, CohortLevel | null>> = {
  'nature-zone-size': 'nature-size',
  'nature-size': 'nature',
  nature: null,
};

/** The identity of a cohort: same nature, same zone, same size (SPEC §4 "Cohorte"). */
export interface CohortKey {
  /** Depth of the cohort, so a fallback is visible and not silent (SPEC §7 rule 1). */
  level: CohortLevel;
  nature: Nature;
  /** Null when the level ignores zones (SPEC §7 rule 1). */
  zone: Zone | null;
  /** Null when the level ignores sizes (SPEC §7 rule 1). */
  size: Size | null;
}

/** One arm of a cohort: tickets done with an agent, or without (SPEC §4 "Bras"). */
export type Arm = 'agent' | 'human';

/** The two arms, SPEC order (SPEC §4 "Bras"). */
export const ARMS: readonly Arm[] = ['agent', 'human'];

/* -------------------------------------------------------------------- stats */

/**
 * A proportion, always with its sample size and its interval
 * (SPEC §7 rule 3, SPEC §20, recipe 10).
 *
 * `rate`, `ciLow` and `ciHigh` are fractions in [0, 1]; the screens show them
 * as percentages.
 */
export interface ProportionStat {
  /** Number of tickets behind the figure (SPEC §7 rule 2). */
  n: number;
  rate: number;
  ciLow: number;
  ciHigh: number;
}

/** A duration, always with its sample size (SPEC §6, SPEC §7). */
export interface DurationStat {
  n: number;
  /** Median delay in hours. A median, never a mean (SPEC §6, SPEC §7). */
  medianH: number;
}

/* ---------------------------------------------------------------- conclusion */

/**
 * The four possible conclusions of a comparison (SPEC §7 rule 4):
 * better, same, worse, and "we do not know", which is a conclusion in its own right.
 */
export type Conclusion = 'better' | 'same' | 'worse' | 'not-enough-data';

/** The four conclusions, SPEC order (SPEC §7 rule 4). */
export const CONCLUSIONS: readonly Conclusion[] = [
  'better',
  'same',
  'worse',
  'not-enough-data',
];

/** What the composition comparison found (SPEC §7 rule 5, DP-10). */
export type BalanceCriterion = 'size-mix' | 'nature-mix' | 'volume-gap';

/** The three composition criteria compared between the two arms (SPEC §7 rule 5). */
export const BALANCE_CRITERIA: readonly BalanceCriterion[] = [
  'size-mix',
  'nature-mix',
  'volume-gap',
];

/** One composition difference between the two arms (SPEC §7 rule 5). */
export interface BalanceSignal {
  criterion: BalanceCriterion;
  /** Share of the criterion in the agent arm, in [0, 1]. */
  agentShare: number;
  /** Share of the criterion in the human arm, in [0, 1]. */
  humanShare: number;
  /** Absolute difference between the two shares, in [0, 1]. */
  difference: number;
}

/**
 * The verdict of the composition comparison: when the arms differ too much the
 * app shows "unbalanced arms" and does not conclude (SPEC §7 rule 5, DP-10, recipe 7).
 */
export interface Balance {
  balanced: boolean;
  signals: readonly BalanceSignal[];
}

/* -------------------------------------------------------------------- epoch */

/**
 * A period during which the team's agents did not change — same tool, same
 * model, same instructions (SPEC §4 "Époque", SPEC §7 rule 6,
 * SPEC §18 table `epoch`, DP-22).
 */
export interface Epoch {
  id: string;
  projectId: string;
  startsAt: string;
  /** Human label, e.g. "new model, 14 September" (SPEC §12). */
  label: string;
  client: string;
  model: string;
  instructionsVersion: string;
}

/* ------------------------------------------------------------- graph rights */

/** The state of one right on the graph, per object type (SPEC §19, DP-19, recipe 15). */
export type GraphPermissionState = 'granted' | 'missing' | 'unknown';

/** The three states of a right (SPEC §19). */
export const GRAPH_PERMISSION_STATES: readonly GraphPermissionState[] = [
  'granted',
  'missing',
  'unknown',
];

/** The object types the app reads on the graph, one right each (SPEC §17, SPEC §19). */
export type GraphObjectType = 'commit' | 'pull-request' | 'issue' | 'user';

/** The four object types the app needs (SPEC §17 permissions). */
export const GRAPH_OBJECT_TYPES: readonly GraphObjectType[] = [
  'commit',
  'pull-request',
  'issue',
  'user',
];

/** The state of one right on the graph (SPEC §19, DP-19). */
export interface GraphPermission {
  objectType: GraphObjectType;
  state: GraphPermissionState;
  /** When the right was last tested, on a ticket whose answer is known (SPEC §17). */
  testedAt: string;
}

/* --------------------------------------------------------------------- demo */

/** Key of the demo flag carried by every card, map and screen (SPEC §13, DP-20). */
export const DEMO_FLAG = 'demo';

/** The demo dataset must be recognisable as such everywhere (SPEC §13, DP-20). */
export const DEMO_DATASET_LABEL = 'demo-dataset';
