/**
 * Mapping of the advice family (SPEC §8, SPEC §10, SPEC §11, SPEC §18,
 * DP-11, DP-12, DP-13, DP-27).
 *
 * `recommendation`, `decision`, `trial` and `trial_assignment`: what the app
 * advises, what was decided, and the controlled draw.
 *
 * Two frozen rows carry fewer columns than their domain object, and the
 * missing parts are rebuilt honestly instead of invented:
 *
 * - `recommendation` stores the verdict (value, cohort, confidence, reasons,
 *   reference tickets, date). The figures of the card (arms, intervals,
 *   balance) live in `cohort_stat` and are recomputed by the domain engine
 *   (L4); a card read from cache alone carries them empty.
 *   CONTRACT-NEEDED: src/types-persistence.ts.RecommendationRow — a cached
 *   card cannot round-trip its figures (no epoch_id, stats, balance,
 *   conditions, guardrails, failure causes, demo columns).
 * - `decision` stores (issue_id, followed, actual_level, reason, at). The
 *   decision taken (`delegate` / `keep-human`) is derived by the store from
 *   `followed` and the recommendation cached for the same ticket.
 *   CONTRACT-NEEDED: src/types-persistence.ts.DecisionRow — no `taken` column.
 * - `trial` stores the period and the state. Epoch, seed and stop reason have
 *   no column; the draws themselves survive in `trial_assignment`.
 *   CONTRACT-NEEDED: src/types-persistence.ts.TrialRow — no epoch_id, seed,
 *   stop_reason columns.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Arm } from '../types.js';
import type {
  Decision,
  RecommendationCard,
  Trial,
  TrialAssignment,
} from '../types-advice.js';
import type {
  DecisionRow,
  RecommendationRow,
  TrialAssignmentRow,
  TrialRow,
} from '../types-persistence.js';
import {
  asNumber,
  asText,
  decodeCohortKey,
  decodeEvidence,
  encodeCohortKey,
  encodeEvidence,
  fromFlag,
  toFlag,
} from './mapping-codec.js';

/** A card whose figures are not cached: honest emptiness, never invention. */
function cardWithoutFigures(row: RecommendationRow): RecommendationCard {
  return {
    issueId: asText(row.issue_id),
    issueKey: asText(row.issue_id),
    value: row.value,
    cohort: decodeCohortKey(asText(row.cohort_key)),
    epochId: '',
    agent: null,
    human: null,
    agentLeadTime: null,
    humanLeadTime: null,
    conclusion: 'not-enough-data',
    balance: { balanced: false, signals: [] },
    confidence: row.confidence,
    reasons: decodeEvidence(asText(row.reasons_json)),
    conditions: [],
    guardrails: [],
    referenceIssueKeys: decodeEvidence(asText(row.refs_json)),
    failureCauses: [],
    demo: false,
    computedAt: asText(row.computed_at),
  };
}

/** Domain -> row: the verdict, the cohort, the reasons, the references. */
export function toRecommendationRow(card: RecommendationCard): RecommendationRow {
  return {
    issue_id: card.issueId,
    value: card.value,
    cohort_key: encodeCohortKey(card.cohort),
    confidence: card.confidence,
    reasons_json: encodeEvidence(card.reasons),
    refs_json: encodeEvidence(card.referenceIssueKeys),
    computed_at: card.computedAt,
  };
}

/** Row -> domain: the cached verdict, figures left to the engine (see head). */
export function toRecommendationCard(row: RecommendationRow): RecommendationCard {
  return cardWithoutFigures(row);
}

/**
 * Domain -> row. `taken` has no column: the pair (cached recommendation,
 * `followed`) carries it, and the store derives it back on read.
 */
export function toDecisionRow(decision: Decision): DecisionRow {
  return {
    issue_id: decision.issueId,
    followed: toFlag(decision.followed),
    actual_level: decision.actualLevel,
    reason: decision.reason,
    at: decision.at,
  };
}

/** Row -> domain: `taken` is the decision the row implies (see file head). */
export function toDecision(row: DecisionRow, taken: Decision['taken']): Decision {
  return {
    issueId: asText(row.issue_id),
    taken,
    followed: fromFlag(asNumber(row.followed)),
    actualLevel: row.actual_level,
    reason: asText(row.reason),
    at: asText(row.at),
  };
}

/** The decision a row implies, given the recommendation cached for the ticket. */
export function takenOf(
  row: DecisionRow,
  cachedValue: string | null,
): Decision['taken'] {
  const followed = fromFlag(asNumber(row.followed));
  const advised = cachedValue === 'delegate' || cachedValue === 'delegate-with-review';
  if (cachedValue === null) return followed ? 'delegate' : 'keep-human';
  return followed && advised ? 'delegate' : 'keep-human';
}

/** Domain -> row: the cohort travels as its stable serialized key. */
export function toTrialRow(trial: Trial): TrialRow {
  return {
    id: trial.id,
    project_id: trial.projectId,
    cohort_key: encodeCohortKey(trial.cohort),
    starts_at: trial.startsAt,
    ends_at: trial.endsAt,
    state: trial.state,
  };
}

/** Row -> domain: epoch, seed and stop reason have no column (see head). */
export function toTrial(row: TrialRow): Trial {
  return {
    id: asText(row.id),
    projectId: asText(row.project_id),
    cohort: decodeCohortKey(asText(row.cohort_key)),
    epochId: '',
    seed: '',
    startsAt: asText(row.starts_at),
    endsAt: asText(row.ends_at),
    state: row.state,
    stopReason: '',
  };
}

/** Domain -> row. */
export function toTrialAssignmentRow(assignment: TrialAssignment): TrialAssignmentRow {
  return {
    trial_id: assignment.trialId,
    issue_id: assignment.issueId,
    arm: assignment.arm as Arm,
    complied: toFlag(assignment.complied),
    excluded_reason: assignment.excludedReason,
  };
}

/** Row -> domain. */
export function toTrialAssignment(row: TrialAssignmentRow): TrialAssignment {
  return {
    trialId: asText(row.trial_id),
    issueId: asText(row.issue_id),
    arm: row.arm,
    complied: fromFlag(asNumber(row.complied)),
    excludedReason: asText(row.excluded_reason),
  };
}
