/**
 * Prioritised collection: read first what informs the most (SPEC §17 "Ce
 * qu'impose le graphe", SPEC §7 rule 2, DP-18; idea 8 of
 * APPROFONDIR-PRODUIT, section B2).
 *
 * The graph is read on behalf of a signed-in user, in bounded slices, during a
 * session (SPEC §17). Reading twelve months in order leaves the first map
 * grey. This module is the pure prioritiser: given the tickets we could read,
 * it ranks them by information value, cuts the slice to the session budget and
 * explains, for every ticket taken, why it was taken. No clock, no network, no
 * randomness: a collection we cannot explain is a collection we cannot resume.
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Arm } from '../types.js';
import { DEFAULT_MIN_ARM_SIZE } from '../domain/stats.js';
import { MAX_SLICE_SIZE } from './graph-plan.js';

/** Session budget for one slice of collection, in minutes (SPEC §17, DP-18). */
export const DEFAULT_BUDGET_MINUTES = 4;

/**
 * Reading rate: one ticket (one graph read) per minute of session. The budget
 * is a session budget, not a quota of tickets (SPEC §17).
 */
export const DEFAULT_SLICES_PER_MINUTE = 1;

/** One ticket of the session budget (SPEC §7 rule 2, SPEC §17). */
export interface CollectionCandidate {
  readonly issueId: string;
  readonly cohortKey: string;
  readonly arm: Arm | 'unknown';
  readonly closedAt: string | null;
  readonly alreadyCollected: boolean;
  /**
   * True when the ticket carries signed commits. An unknown involvement on a
   * signed ticket advances two things at once: the arm of the cohort and the
   * involvement of the ticket (DP-18). Missing data is `false`, never a guess.
   */
  readonly commitsSigned?: boolean;
}

/** What one cohort still lacks to leave the grey zone (SPEC §7 rule 2). */
export interface CohortNeed {
  readonly cohortKey: string;
  readonly agentCount: number;
  readonly humanCount: number;
  readonly threshold: number;
}

/** Why one ticket was taken, in one line (SPEC §17, DP-18). */
export interface SliceRationale {
  readonly issueId: string;
  readonly reason: string;
  readonly gain: number;
}

/** One bounded slice of collection, explained (SPEC §17, DP-18). */
export interface PrioritisedSlice {
  readonly issueIds: readonly string[];
  readonly rationale: readonly SliceRationale[];
  readonly budgetMinutes: number;
}

/** Proximity of a cohort to the threshold: 1 or 2 tickets away is the jackpot. */
const NEAR_GAP_SCORES: Readonly<Record<number, number>> = { 1: 100, 2: 80 };

/** Decay used beyond the two-ticket window (SPEC §7 rule 2). */
const FAR_GAP_NUMERATOR = 40;

/** Multipliers applied to the proximity score (DP-18). */
const SMALLER_ARM_FACTOR = 2;
const SIGNED_UNKNOWN_FACTOR = 3;
const PLAIN_FACTOR = 1;

/**
 * Count, per cohort, how many tickets each arm already holds. Only tickets
 * already collected are part of the coverage map: a candidate is exactly what
 * the map does not know yet (SPEC §17). Tickets whose arm is unknown count for
 * nobody: an unknown is never a zero (SPEC §5). Every cohort a candidate
 * mentions appears, so the first slice can start from an all-grey map.
 */
export function cohortNeeds(
  candidates: readonly CollectionCandidate[],
  threshold: number = DEFAULT_MIN_ARM_SIZE,
): readonly CohortNeed[] {
  const counts = new Map<string, { agent: number; human: number }>();
  for (const candidate of candidates) {
    const bucket = counts.get(candidate.cohortKey) ?? { agent: 0, human: 0 };
    if (candidate.alreadyCollected && candidate.arm === 'agent') bucket.agent += 1;
    if (candidate.alreadyCollected && candidate.arm === 'human') bucket.human += 1;
    counts.set(candidate.cohortKey, bucket);
  }
  return [...counts.entries()]
    .map(([cohortKey, bucket]) => ({
      cohortKey,
      agentCount: bucket.agent,
      humanCount: bucket.human,
      threshold,
    }))
    .sort((a, b) => (a.cohortKey < b.cohortKey ? -1 : a.cohortKey > b.cohortKey ? 1 : 0));
}

/**
 * Information value of one ticket: how much it brings the cohort out of the
 * grey zone. A cohort one or two tickets from the threshold wins over a
 * cohort twenty tickets away, the smaller arm of the cohort wins over the
 * larger one, and an unknown involvement on a signed ticket wins over both
 * because one read resolves two things at once (SPEC §7 rule 2, DP-18).
 */
export function informationGain(
  candidate: CollectionCandidate,
  needs: readonly CohortNeed[],
): number {
  if (candidate.alreadyCollected) return 0;
  if (candidate.closedAt === null) return 0;
  const need = needs.find((entry) => entry.cohortKey === candidate.cohortKey);
  if (!need) return 0;
  return proximityScore(need) * armFactor(candidate, need);
}

/**
 * Rank the candidates by information value, cut the slice to the session
 * budget and explain every ticket taken (SPEC §17, DP-18).
 */
export function prioritise(
  candidates: readonly CollectionCandidate[],
  options: { threshold?: number; budgetMinutes?: number; slicesPerMinute?: number },
): PrioritisedSlice {
  const threshold = options.threshold ?? DEFAULT_MIN_ARM_SIZE;
  const budgetMinutes = options.budgetMinutes ?? DEFAULT_BUDGET_MINUTES;
  const slicesPerMinute = options.slicesPerMinute ?? DEFAULT_SLICES_PER_MINUTE;
  const needs = cohortNeeds(candidates, threshold);
  const ranked = rankCandidates(candidates, needs).slice(0, sliceCapacity(budgetMinutes, slicesPerMinute));
  return {
    issueIds: ranked.map((entry) => entry.candidate.issueId),
    rationale: ranked.map((entry) => ({
      issueId: entry.candidate.issueId,
      reason: reasonFor(entry.candidate, needs),
      gain: entry.gain,
    })),
    budgetMinutes,
  };
}

/** Explain the slice: what was taken, why, and for which budget (SPEC §17). */
export function explainPriority(slice: PrioritisedSlice): string {
  if (slice.issueIds.length === 0) {
    return (
      'Nothing to collect in this budget: every candidate is already collected ' +
      'or brings no information. / Rien à collecter dans ce budget : chaque candidat ' +
      'est déjà collecté ou n’apporte aucune information.'
    );
  }
  const header =
    `Slice: ${slice.issueIds.length} ticket(s) for ${slice.budgetMinutes} min of session. / ` +
    `Tranche : ${slice.issueIds.length} ticket(s) pour ${slice.budgetMinutes} min de session.`;
  const lines = slice.rationale.map(
    (entry, index) => `${index + 1}. ${entry.issueId} (gain ${entry.gain}) — ${entry.reason}`,
  );
  return [header, ...lines].join('\n');
}

/** Tickets the session budget allows, never more than one graph slice. */
function sliceCapacity(budgetMinutes: number, slicesPerMinute: number): number {
  const raw = Math.floor(Math.max(0, budgetMinutes) * Math.max(0, slicesPerMinute));
  return Math.min(raw, MAX_SLICE_SIZE);
}

/** Score of the cohort proximity: the closer to the threshold, the better. */
function proximityScore(need: CohortNeed): number {
  const gap = Math.max(0, need.threshold - Math.min(need.agentCount, need.humanCount));
  const near = NEAR_GAP_SCORES[gap];
  if (near !== undefined) return near;
  if (gap === 0) return PLAIN_FACTOR;
  return Math.max(1, Math.round(FAR_GAP_NUMERATOR / gap));
}

/** Multiplier: smaller arm, or an unknown that a signed commit can resolve. */
function armFactor(candidate: CollectionCandidate, need: CohortNeed): number {
  if (candidate.arm === 'unknown') {
    return candidate.commitsSigned === true ? SIGNED_UNKNOWN_FACTOR : PLAIN_FACTOR;
  }
  const smaller = smallestArm(need);
  if (smaller === null) return PLAIN_FACTOR;
  return candidate.arm === smaller ? SMALLER_ARM_FACTOR : PLAIN_FACTOR;
}

/** The arm furthest from the threshold, or null when both are equidistant. */
function smallestArm(need: CohortNeed): Arm | null {
  const agentGap = Math.max(0, need.threshold - need.agentCount);
  const humanGap = Math.max(0, need.threshold - need.humanCount);
  if (agentGap === humanGap) return null;
  return agentGap > humanGap ? 'agent' : 'human';
}

/** Rank the eligible candidates: highest gain first, ties broken by issue id. */
function rankCandidates(
  candidates: readonly CollectionCandidate[],
  needs: readonly CohortNeed[],
): readonly { candidate: CollectionCandidate; gain: number }[] {
  return candidates
    .map((candidate) => ({ candidate, gain: informationGain(candidate, needs) }))
    .filter((entry) => entry.gain > 0)
    .sort((a, b) => {
      if (b.gain !== a.gain) return b.gain - a.gain;
      if (a.candidate.issueId === b.candidate.issueId) return 0;
      return a.candidate.issueId < b.candidate.issueId ? -1 : 1;
    });
}

/** One bilingual line saying why the ticket was taken (SPEC §17, DP-18). */
function reasonFor(candidate: CollectionCandidate, needs: readonly CohortNeed[]): string {
  const need = needs.find((entry) => entry.cohortKey === candidate.cohortKey);
  if (!need) return 'Unknown cohort. / Cohorte inconnue.';
  const gap = Math.max(0, need.threshold - Math.min(need.agentCount, need.humanCount));
  const gapText = `${gap} ticket(s) from leaving the grey zone.`;
  if (candidate.arm === 'unknown') return unknownReason(candidate, need, gapText);
  return armReason(candidate, need, gapText);
}

/** Why an unknown involvement is worth a read (DP-18). */
function unknownReason(
  candidate: CollectionCandidate,
  need: CohortNeed,
  gapText: string,
): string {
  if (candidate.commitsSigned === true) {
    return (
      `Cohort ${need.cohortKey}: ${gapText} Involvement unknown but commits are signed, ` +
      'so one read resolves the arm and the involvement at once. / ' +
      `Cohorte ${need.cohortKey} : ${gapText} Implication inconnue mais commits signés, ` +
      'une lecture résout le bras et l’implication à la fois.'
    );
  }
  return (
    `Cohort ${need.cohortKey}: ${gapText} Involvement unknown and no signed commit to ` +
    'resolve it, so the read may not change the arm. / ' +
    `Cohorte ${need.cohortKey} : ${gapText} Implication inconnue et aucun commit signé ` +
    'pour la résoudre, la lecture peut ne pas changer le bras.'
  );
}

/** Why a ticket of a known arm is worth a read (SPEC §7 rule 2). */
function armReason(candidate: CollectionCandidate, need: CohortNeed, gapText: string): string {
  const arm = candidate.arm as Arm;
  const smaller = smallestArm(need);
  if (smaller === null || arm === smaller) {
    return (
      `Cohort ${need.cohortKey}: ${gapText} This ticket fills the smaller arm (${arm}). / ` +
      `Cohorte ${need.cohortKey} : ${gapText} Ce ticket remplit le bras le plus petit (${arm}).`
    );
  }
  const count = arm === 'agent' ? need.agentCount : need.humanCount;
  const missing = Math.max(0, need.threshold - count);
  return (
    `Cohort ${need.cohortKey}: ${gapText} This ticket fills the larger arm (${arm}); ` +
    `the smaller arm still misses ${missing} ticket(s). / ` +
    `Cohorte ${need.cohortKey} : ${gapText} Ce ticket remplit le bras le plus grand (${arm}) ; ` +
    `le bras le plus petit manque encore de ${missing} ticket(s).`
  );
}
