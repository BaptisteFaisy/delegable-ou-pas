/**
 * Domain contract — what the app decides (SPEC §7 comparison, §8 recommendation,
 * §10 calibration, §11 controlled trial, §12 delegation map, §13 adoption,
 * §16 screens).
 *
 * Companion of `src/types.ts` (measured vocabulary) and `src/types-mcp.ts`
 * (tool shapes). Three rules shape every type here:
 * - no rate without its sample size and its interval (SPEC §7 rule 3, §20);
 * - "we do not know" is a value like the others, never an absence (SPEC §7 rule 4);
 * - nothing here identifies a person: `peopleCount` only masks a cohort carried
 *   by fewer than three people (SPEC §7 rule 8, DP-17).
 *
 * Changing a type here is a contract change: a dedicated pull request whose
 * body carries `CONTRACT-CHANGE` (docs/CONTRACTS.md).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type {
  Arm,
  Balance,
  CohortKey,
  Conclusion,
  DurationStat,
  Epoch,
  GraphPermission,
  Level,
  Nature,
  ProportionStat,
  Size,
  Zone,
} from './types.js';

/* ---------------------------------------------------------- recommendation */

/**
 * The four recommendations of SPEC §8 "La règle", in the order of the table.
 *
 * `not-enough-data` covers the last row (sample under the threshold, unbalanced
 * arms, too much unknown involvement) and is a recommendation, not an error.
 */
export type Recommendation =
  | 'delegate'
  | 'delegate-with-review'
  | 'keep-human'
  | 'not-enough-data';

/** The four recommendations, SPEC §8 order. */
export const RECOMMENDATIONS: readonly Recommendation[] = [
  'delegate',
  'delegate-with-review',
  'keep-human',
  'not-enough-data',
];

/** How much the figures behind a recommendation are worth (SPEC §8 "Confiance"). */
export type Confidence = 'high' | 'medium' | 'low';

/** The three confidence levels, from the surest down (SPEC §8). */
export const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];

/**
 * A guardrail that forbids "hand it to an agent", whatever the figures say
 * (SPEC §8 "Les garde-fous", DP-12).
 */
export type Guardrail =
  | 'open-incident'
  | 'sensitive-zone'
  | 'missing-acceptance-criteria';

/** The three guardrails of SPEC §8, in the order of the SPEC. */
export const GUARDRAILS: readonly Guardrail[] = [
  'open-incident',
  'sensitive-zone',
  'missing-acceptance-criteria',
];

/** The colour of one cell of the delegation matrix (SPEC §12 "La matrice"). */
export type MapColor = 'green' | 'orange' | 'red' | 'grey';

/** The four colours, in the order of SPEC §12 (grey = "we do not know"). */
export const MAP_COLORS: readonly MapColor[] = ['green', 'orange', 'red', 'grey'];

/** The colour a recommendation paints on the matrix (SPEC §12). */
export const MAP_COLOR_OF: Readonly<Record<Recommendation, MapColor>> = {
  delegate: 'green',
  'delegate-with-review': 'orange',
  'keep-human': 'red',
  'not-enough-data': 'grey',
};

/** The recommendation a matrix colour stands for (SPEC §12, inverse of the table above). */
export const RECOMMENDATION_OF: Readonly<Record<MapColor, Recommendation>> = {
  green: 'delegate',
  orange: 'delegate-with-review',
  red: 'keep-human',
  grey: 'not-enough-data',
};

/* -------------------------------------------------------------- cohort stat */

/**
 * The figures of one arm of one cohort, in one epoch (SPEC §7, DP-07, DP-08).
 *
 * This is the row the nightly job caches and every screen reads: a cohort is
 * never recomputed twice in two places (SPEC §17 "Statistiques", §20 "Rapidité").
 */
export interface CohortStat {
  projectId: string;
  epochId: string;
  /** The cohort, fallback level included, so a widening is visible (SPEC §7 rule 1). */
  key: CohortKey;
  arm: Arm;
  /** Clean closure, with its sample size and its interval (SPEC §7 rule 3). */
  clean: ProportionStat;
  /** Median delay in hours, never a mean (SPEC §6, SPEC §7). */
  medianLeadH: number;
  /** Review load of the arm: reviewers, changes requested, comments (SPEC §6). */
  reviewLoad: number;
  /** Distinct people behind the arm; used only to mask it (SPEC §7 rule 8, DP-17). */
  peopleCount: number;
  conclusion: Conclusion;
  computedAt: string;
}

/* ------------------------------------------------------- recommendation card */

/**
 * The card a developer sees on a ticket (SPEC §8 "Ce que voit le développeur",
 * DP-11) and the answer of `should-delegate` (SPEC §15).
 *
 * One type for both, so the panel, the MCP tool and the map can never disagree.
 */
export interface RecommendationCard {
  issueId: string;
  /** Human key of the ticket, e.g. `PROJ-412` (SPEC §8). */
  issueKey: string;
  value: Recommendation;
  /** The cohort the advice comes from, with its fallback level (SPEC §8, §7 rule 1). */
  cohort: CohortKey;
  /** Epoch the figures belong to: one epoch at a time (SPEC §7 rule 6, DP-22). */
  epochId: string;
  /** Clean closure with an agent; null when that arm has no ticket (SPEC §7 rule 3). */
  agent: ProportionStat | null;
  /** Clean closure without an agent; null when that arm has no ticket (SPEC §7 rule 3). */
  human: ProportionStat | null;
  /** Median delay of each arm, in hours (SPEC §6). */
  agentLeadTime: DurationStat | null;
  humanLeadTime: DurationStat | null;
  conclusion: Conclusion;
  /** Whether the two arms are comparable at all (SPEC §7 rule 5, DP-10). */
  balance: Balance;
  confidence: Confidence;
  /** Why the app says this, in plain words (SPEC §8). */
  reasons: readonly string[];
  /** What must hold for the advice to be followed (SPEC §8 "Conditions"). */
  conditions: readonly string[];
  /** Guardrails that fired; a non-empty list forbids `delegate` (SPEC §8, DP-12). */
  guardrails: readonly Guardrail[];
  /** The past tickets the advice rests on (SPEC §4 "Fondement"). */
  referenceIssueKeys: readonly string[];
  /** What went wrong with an agent in this cohort, in plain words (SPEC §8, DP-26). */
  failureCauses: readonly string[];
  /** True when the card comes from the demo dataset (SPEC §13, DP-20). */
  demo: boolean;
  computedAt: string;
}

/* ----------------------------------------------------------------- decision */

/**
 * The decision actually taken on a ticket, followed or not (SPEC §8 "Un avis,
 * pas un ordre", SPEC §18 table `decision`, DP-13).
 *
 * The decision is never a judgement on a person: it records what was decided,
 * then feeds the calibration (SPEC §10).
 */
export interface Decision {
  issueId: string;
  /** What was decided: hand it to an agent, or keep it for a human (SPEC §8). */
  taken: 'delegate' | 'keep-human';
  /** True when the decision followed the recommendation displayed at the time (SPEC §13). */
  followed: boolean;
  /** Involvement level the ticket really got afterwards (SPEC §6 "Reprise humaine"). */
  actualLevel: Level;
  reason: string;
  at: string;
}

/* -------------------------------------------------------------- calibration */

/**
 * One row of the calibration: a recommendation given, the clean closure
 * observed afterwards (SPEC §10 "La calibration", SPEC §18 table `calibration`,
 * DP-21).
 *
 * A statistics row: no person identifier lives here (SPEC §18, last line).
 */
export interface Calibration {
  projectId: string;
  epochId: string;
  value: Recommendation;
  /** Clean closure observed among the tickets that received this recommendation (SPEC §10). */
  clean: ProportionStat;
}

/* -------------------------------------------------------------------- trial */

/**
 * The state of a controlled trial (SPEC §11 "L'essai contrôlé", DP-27).
 *
 * The trial stops when the gap is established, at the planned date, or when one
 * arm piles up reopenings (SPEC §11 step 4).
 */
export type TrialState = 'planned' | 'running' | 'stopped' | 'completed';

/** The four trial states, in the order of a trial's life (SPEC §11). */
export const TRIAL_STATES: readonly TrialState[] = [
  'planned',
  'running',
  'stopped',
  'completed',
];

/**
 * One controlled trial: a cohort, a window, a state (SPEC §11, SPEC §18 table
 * `trial`).
 *
 * The draw is reproducible from a seed, so re-running a trial never changes an
 * assignment (SPEC §11 step 2, `Randomness` in `src/ports.ts`).
 */
export interface Trial {
  id: string;
  projectId: string;
  /** The cohort where the conclusion was "we do not know" (SPEC §11 step 1). */
  cohort: CohortKey;
  epochId: string;
  /** Seed of the draw, kept so the assignment can be replayed (SPEC §11 step 2). */
  seed: string;
  startsAt: string;
  endsAt: string;
  state: TrialState;
  /** Why the trial stopped early; empty while it runs (SPEC §11 step 4). */
  stopReason: string;
}

/**
 * The arm drawn for one ticket of a trial (SPEC §11 step 2, step 3, SPEC §18
 * table `trial_assignment`, recipe 16).
 *
 * A ticket whose draw was not respected leaves the trial, with its reason.
 */
export interface TrialAssignment {
  trialId: string;
  issueId: string;
  /** The arm drawn by the trial, not the arm that worked (SPEC §11 step 2). */
  arm: Arm;
  /** True when the drawn arm was the one that actually did the work (SPEC §11 step 3). */
  complied: boolean;
  /** Why the ticket left the trial; empty when it still counts (SPEC §11 step 3). */
  excludedReason: string;
}

/* ----------------------------------------------------------------- coverage */

/**
 * What the coverage screen shows: how much of the involvement is known, what the
 * graph rights are worth, when collection last ran (SPEC §16.6, SPEC §13, DP-19).
 *
 * The rate of known involvement is a health indicator, not a score (SPEC §13).
 */
export interface Coverage {
  projectId: string;
  /** Tickets whose involvement level is known (SPEC §13). */
  knownIssues: number;
  totalIssues: number;
  /** State of each right on the graph, one per object type (SPEC §19, recipe 15). */
  permissions: readonly GraphPermission[];
  /** Last collection attempt, empty when none ran yet (SPEC §17, DP-19). */
  lastCollectionAt: string;
  /** False when the last collection ended on a missing right or an error (SPEC §19). */
  lastCollectionOk: boolean;
  /** True when the project runs on the demo dataset (SPEC §13, DP-20). */
  demo: boolean;
}

/* ----------------------------------------------------------------- settings */

/**
 * The "strengthened review" definition, as each project writes it
 * (SPEC §8 "Ce que veut dire relecture renforcée").
 *
 * The app displays it with the recommendation: it never invents the rule.
 */
export interface HardenedReview {
  /** Short label shown under the recommendation (SPEC §8). */
  label: string;
  /** Minimum number of reviewers (SPEC §8: "deux relecteurs"). */
  minReviewers: number;
  /** True when a reviewer responsible for the zone is required (SPEC §8). */
  zoneOwnerRequired: boolean;
  /** True when one evidence per acceptance criterion is required (SPEC §8, §28). */
  evidencePerCriterion: boolean;
}

/**
 * The settings of one project (SPEC §16.5 "Réglages du projet", SPEC §13 "La
 * date d'adoption", §18 table `settings`).
 *
 * `minArmSize` is the threshold of SPEC §7 rule 2: twenty by default, tunable.
 * `adoptionDate` splits "without agent" from "with agent" by construction
 * (SPEC §13, recipe 3).
 */
export interface ProjectSettings {
  projectId: string;
  projectKey: string;
  /** Sample size below which the app refuses to conclude (SPEC §7 rule 2). */
  minArmSize: number;
  /** Date the team started using agents; empty when it never declared one (SPEC §13). */
  adoptionDate: string;
  /** Natures the project declares (SPEC §16.5, SPEC §4 "Nature"). */
  natures: readonly Nature[];
  /** Zones of the codebase (SPEC §16.5, §4 "Cohorte"). */
  zones: readonly Zone[];
  /** Sizes of tickets, from the smallest to the largest (SPEC §16.5). */
  sizes: readonly Size[];
  /** Zones where "hand it to an agent" is forbidden (SPEC §8, DP-12). */
  sensitiveZones: readonly Zone[];
  /** The project's own definition of strengthened review (SPEC §8). */
  hardenedReview: HardenedReview;
  /** Statuses that do not count in the delay (SPEC §6 "Délai"). */
  waitingStatuses: readonly string[];
  /** True when the project is the demo dataset (SPEC §13, DP-20). */
  demo: boolean;
  updatedAt: string;
}

/* ---------------------------------------------------------- delegation map */

/**
 * One cell of the delegation matrix: natures in rows, zones in columns
 * (SPEC §12 "La matrice", DP-14).
 *
 * A cell opens its cohort; a grey cell says "we do not know" like the others.
 */
export interface DelegationMapCell {
  nature: Nature;
  zone: Zone;
  color: MapColor;
  recommendation: Recommendation;
  /** The cohort behind the cell, so the screen can open it (SPEC §12, DP-14). */
  cohort: CohortKey;
  /** Sample sizes of both arms, so a cell is never shown without them (SPEC §20). */
  agentN: number;
  humanN: number;
  /** True when the cell is hidden because fewer than three people carry it (SPEC §7 rule 8, DP-17). */
  masked: boolean;
  /** Median amount of the cause, i.e. "what would turn this cell from red to orange" (SPEC §12). */
  failureCauses: readonly string[];
}

/**
 * The delegation map of one project (SPEC §12, SPEC §16.2, DP-14).
 *
 * A total is never shown alone: the map carries its own decomposition, cell by
 * cell (SPEC §7 rule 7, §21 "Total favorable, cohortes défavorables").
 */
export interface DelegationMap {
  projectId: string;
  epochId: string;
  /** The epochs shown, the current one first (SPEC §12 "Les époques", DP-22). */
  epochs: readonly Epoch[];
  natures: readonly Nature[];
  zones: readonly Zone[];
  cells: readonly DelegationMapCell[];
  /** Share of grey cells, in [0, 1] (SPEC §12). */
  greyShare: number;
  /** Share of the sprint's points that are "hand it to an agent" (SPEC §12, DP-24). */
  delegableShare: number;
  /** Sprint the share was computed on; empty when no sprint was given (SPEC §12, DP-24). */
  sprintId: string;
  /** Tickets delegated against the advice and badly finished, and greens kept by humans (SPEC §12). */
  deviations: readonly MapDeviation[];
  demo: boolean;
  computedAt: string;
}

/**
 * One deviation from the recommendation (SPEC §12 "Les écarts à la
 * recommandation").
 *
 * No person name: a count, a cohort and a direction (SPEC §12, DP-17).
 */
export interface MapDeviation {
  cohort: CohortKey;
  /** `delegated-against`: confided despite "keep it for a human"; `kept-despite-green`: kept in a green cell. */
  direction: 'delegated-against' | 'kept-despite-green';
  count: number;
  /** Share of the tickets of that direction that closed clean, in [0, 1] (SPEC §12). */
  cleanRate: number;
}
