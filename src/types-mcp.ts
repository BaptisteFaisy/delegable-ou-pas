/**
 * Domain contract — inputs and outputs of the nine MCP tools (SPEC §15,
 * SPEC §9 "Pour les agents et les orchestrateurs", DP-15).
 *
 * Two rules shape every type here:
 * - no tool accepts a person name in input, and no tool returns one
 *   (SPEC §15, DP-17, recipe 12);
 * - every rate comes with its sample size and its interval (SPEC §7 rule 3,
 *   SPEC §20, recipe 10).
 *
 * The read tools are `GET`, so an automation rule can call them; the write
 * tools are `CREATE` or `UPDATE` (SPEC §15, SPEC §19 "Action").
 */
import type {
  Arm,
  Balance,
  CohortKey,
  Conclusion,
  DurationStat,
  Level,
  Nature,
  ProportionStat,
  Size,
  Zone,
} from './types.js';
import type {
  Confidence,
  Guardrail,
  MapColor,
  Recommendation,
} from './types-advice.js';

/* ------------------------------------------------------------------- the tools */

/** The nine MCP tools, in the order of SPEC §15. */
export type McpToolKey =
  | 'should-delegate'
  | 'list-delegable-work'
  | 'get-delegation-evidence'
  | 'get-delegation-map'
  | 'get-cohort'
  | 'get-calibration'
  | 'record-involvement'
  | 'record-decision'
  | 'report-takeover';

/** The nine tool keys, SPEC order (SPEC §15). */
export const MCP_TOOL_KEYS: readonly McpToolKey[] = [
  'should-delegate',
  'list-delegable-work',
  'get-delegation-evidence',
  'get-delegation-map',
  'get-cohort',
  'get-calibration',
  'record-involvement',
  'record-decision',
  'report-takeover',
];

/** The verb of each tool: reads are `GET`, writes are `CREATE` or `UPDATE` (SPEC §15). */
export const MCP_TOOL_VERBS: Readonly<Record<McpToolKey, 'GET' | 'CREATE' | 'UPDATE'>> = {
  'should-delegate': 'GET',
  'list-delegable-work': 'GET',
  'get-delegation-evidence': 'GET',
  'get-delegation-map': 'GET',
  'get-cohort': 'GET',
  'get-calibration': 'GET',
  'record-involvement': 'CREATE',
  'record-decision': 'CREATE',
  'report-takeover': 'UPDATE',
};

/** Every tool answers in the same envelope, so a failure is never a bare exception. */
export interface McpResult<T> {
  ok: boolean;
  /** Empty when `ok` is true; a short reason when it is not (SPEC §20). */
  error: string;
  /** The payload; null when the tool could not answer (SPEC §20 "données absentes = normales"). */
  data: T | null;
}

/* ------------------------------------------------------------ should-delegate */

/** Input of `should-delegate` (SPEC §15). */
export interface ShouldDelegateInput {
  issueKey: string;
}

/** Output of `should-delegate`: the map of one ticket (SPEC §15, SPEC §9, DP-11). */
export interface ShouldDelegateOutput {
  issueKey: string;
  recommendation: Recommendation;
  confidence: Confidence;
  /** Why the app says this, in plain words (SPEC §8). */
  reasons: readonly string[];
  /** What must hold for the advice to be followed (SPEC §8 "Conditions"). */
  conditions: readonly string[];
  /** Guardrails that fired; a non-empty list forbids "delegate" (SPEC §8, DP-12). */
  guardrails: readonly Guardrail[];
  /** The cohort the advice comes from (SPEC §8 "Cohorte"). */
  cohort: CohortKey;
  /** True when the answer comes from the demo dataset (SPEC §13, DP-20). */
  demo: boolean;
}

/* -------------------------------------------------------- list-delegable-work */

/** Input of `list-delegable-work` (SPEC §15). */
export interface ListDelegableWorkInput {
  jql: string;
  limit: number;
}

/** One ticket an orchestrator may take (SPEC §9, SPEC §15, recipe 13). */
export interface DelegableWorkItem {
  issueKey: string;
  confidence: Confidence;
  /** Why this ticket is safe, in one line (SPEC §8). */
  reasons: readonly string[];
}

/**
 * Output of `list-delegable-work`: only tickets marked "hand it to an agent",
 * from the safest to the least safe (SPEC §9, SPEC §15, recipe 13).
 */
export interface ListDelegableWorkOutput {
  items: readonly DelegableWorkItem[];
  /** True when the list comes from the demo dataset (SPEC §13, DP-20). */
  demo: boolean;
}

/* ---------------------------------------------------- get-delegation-evidence */

/** Input of `get-delegation-evidence` (SPEC §15). */
export interface GetDelegationEvidenceInput {
  issueKey: string;
}

/**
 * Output of `get-delegation-evidence`: the cohort, the sample sizes, the
 * intervals and the reference tickets behind one recommendation
 * (SPEC §15, SPEC §20 "Explicabilité", DP-11).
 */
export interface GetDelegationEvidenceOutput {
  issueKey: string;
  cohort: CohortKey;
  /** Clean closure with an agent, with sample size and interval (SPEC §7 rule 3). */
  agent: ProportionStat | null;
  /** Clean closure without an agent, with sample size and interval (SPEC §7 rule 3). */
  human: ProportionStat | null;
  /** Median delay of each arm, in hours (SPEC §6). */
  agentLeadTime: DurationStat | null;
  humanLeadTime: DurationStat | null;
  /** What went wrong with an agent, in plain words (SPEC §8 example, DP-26). */
  failureCauses: readonly string[];
  /** The past tickets the recommendation rests on (SPEC §4 "Fondement"). */
  referenceIssueKeys: readonly string[];
  conclusion: Conclusion;
  /** Whether the two arms are comparable (SPEC §7 rule 5, DP-10). */
  balance: Balance;
  demo: boolean;
}

/* --------------------------------------------------------- get-delegation-map */

/** Input of `get-delegation-map` (SPEC §15). */
export interface GetDelegationMapInput {
  projectKey: string;
}

/** One cell of the summarized matrix (SPEC §12, SPEC §15). */
export interface DelegationMapCellSummary {
  nature: Nature;
  zone: Zone;
  color: MapColor;
  recommendation: Recommendation;
}

/**
 * Output of `get-delegation-map`: the summarized matrix and the grey share
 * (SPEC §12, SPEC §15, DP-14).
 */
export interface GetDelegationMapOutput {
  projectKey: string;
  natures: readonly Nature[];
  zones: readonly Zone[];
  cells: readonly DelegationMapCellSummary[];
  /** Share of grey cells, in [0, 1]: "we do not know" is an answer (SPEC §12). */
  greyShare: number;
  demo: boolean;
}

/* ---------------------------------------------------------------- get-cohort */

/** Input of `get-cohort` (SPEC §15). */
export interface GetCohortInput {
  projectKey: string;
  nature: Nature;
  zone: Zone;
  size: Size;
}

/** The figures of one arm inside one epoch (SPEC §7 rule 6, DP-22). */
export interface CohortEpochArm {
  epochId: string;
  epochLabel: string;
  arm: Arm;
  /** Clean closure with sample size and interval (SPEC §7 rule 3). */
  clean: ProportionStat;
  /** Median delay in hours (SPEC §6). */
  leadTime: DurationStat;
  /** Review load: reviewers, changes requested, comments (SPEC §6 "Relecture"). */
  reviewLoad: number;
}

/** One epoch of a cohort, with both arms (SPEC §7 rule 6, recipe 14). */
export interface CohortEpoch {
  epochId: string;
  epochLabel: string;
  arms: readonly CohortEpochArm[];
  conclusion: Conclusion;
  balance: Balance;
  /** True when the epoch is not the current one: shown, but greyed out (SPEC §21). */
  outdated: boolean;
}

/**
 * Output of `get-cohort`: the detail of one cohort, epoch by epoch
 * (SPEC §15, SPEC §16.3, DP-07, DP-22, recipe 14).
 */
export interface GetCohortOutput {
  cohort: CohortKey;
  epochs: readonly CohortEpoch[];
  /** True when the cohort is hidden because fewer than three people carry it (SPEC §7 rule 8, DP-17, recipe 11). */
  masked: boolean;
  /** Number of distinct people behind the cohort, shown only when not masked (SPEC §18 `people_count`). */
  peopleCount: number;
  demo: boolean;
}

/* ------------------------------------------------------------ get-calibration */

/** Input of `get-calibration` (SPEC §15). */
export interface GetCalibrationInput {
  projectKey: string;
}

/** One row of the calibration table (SPEC §10, DP-21). */
export interface CalibrationRow {
  recommendation: Recommendation;
  n: number;
  /** Clean closure observed afterwards, with sample size and interval (SPEC §7 rule 3). */
  clean: ProportionStat;
}

/**
 * Output of `get-calibration`: how right the past recommendations were
 * (SPEC §10, SPEC §15, SPEC §16.7, DP-21).
 */
export interface GetCalibrationOutput {
  projectKey: string;
  rows: readonly CalibrationRow[];
  /** True when "hand it to an agent" does not clearly beat "keep it for a human": the app says so up front (SPEC §10). */
  adviceAddsNothing: boolean;
  demo: boolean;
}

/* -------------------------------------------------------- record-involvement */

/** Input of `record-involvement` (SPEC §15). No person name is accepted (SPEC §15). */
export interface RecordInvolvementInput {
  issueKey: string;
  level: Level;
  /** Tool that declares (SPEC §5, source 1). */
  client: string;
  /** Model used (SPEC §5, source 1). */
  model: string;
  /** Session reference (SPEC §5, source 1). */
  session: string;
}

/** Output of `record-involvement`: the involvement as stored (SPEC §15, DP-01). */
export interface RecordInvolvementOutput {
  issueKey: string;
  level: Level;
  /** The source kept by the app, always shown (SPEC §5, DP-01). */
  source: string;
  recordedAt: string;
}

/* ---------------------------------------------------------- record-decision */

/** Input of `record-decision` (SPEC §15). */
export interface RecordDecisionInput {
  issueKey: string;
  /** The decision taken: delegate, or keep it for a human (SPEC §8 "Un avis, pas un ordre"). */
  decision: 'delegate' | 'keep-human';
  reason: string;
}

/** Output of `record-decision`: the decision matched against the advice (SPEC §15, DP-13). */
export interface RecordDecisionOutput {
  issueKey: string;
  /** The recommendation that was displayed when the decision was taken (SPEC §8). */
  recommendation: Recommendation;
  /** True when the decision followed the recommendation (SPEC §13). */
  followed: boolean;
  recordedAt: string;
}

/* ------------------------------------------------------------ report-takeover */

/** Input of `report-takeover` (SPEC §15, SPEC §9). */
export interface ReportTakeoverInput {
  issueKey: string;
  reason: string;
}

/** Output of `report-takeover`: the human takeover as stored (SPEC §6 "Reprise humaine", DP-13). */
export interface ReportTakeoverOutput {
  issueKey: string;
  /** The involvement level the ticket fell back to (SPEC §6). */
  level: Level;
  recordedAt: string;
}
