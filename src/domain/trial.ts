/**
 * Controlled trial (SPEC §11 "L'essai contrôlé", DP-27).
 *
 * A cohort whose conclusion was "we do not know" is put on trial: every
 * eligible ticket (ready, not urgent, outside a sensitive zone) gets a draw
 * agent / human. The draw is reproducible from a seed kept on the trial, never
 * a bare `Math.random()` (SPEC §11 step 2). A ticket whose draw was not
 * respected leaves the trial with its reason (recipe 16). The trial is the
 * only figure the app may call "proved" (SPEC §7, METHODE.md §9).
 */
import type { Arm, Zone } from '../types.js';
import type { Trial, TrialAssignment } from '../types-advice.js';
import type { Randomness } from '../ports.js';
import type { PowerPlan, TrialPlanInput } from './power.js';
import { trialPlan } from './power.js';
import type { LookDecision } from './sequential.js';
import { evaluateLook, obrienFlemingBoundaries } from './sequential.js';

/** A trial stops when one arm piles up this many reopenings (SPEC §11 step 4). */
export const REOPENING_STOP_THRESHOLD: number = 3;

/** The two arms, SPEC order (SPEC §4 "Bras"). */
const ARMS: readonly Arm[] = ['agent', 'human'];

/**
 * Whether a ticket may enter the trial (SPEC §11 step 1): ready (acceptance
 * criteria present), not urgent, and outside a sensitive zone. All three must
 * hold.
 */
export function isEligible(
  hasAcceptanceCriteria: boolean,
  zone: Zone,
  sensitiveZones: readonly Zone[],
  urgent: boolean,
): boolean {
  return hasAcceptanceCriteria && !urgent && !sensitiveZones.includes(zone);
}

/**
 * The draw for one ticket, reproducible and auditable (SPEC §11 step 2): the
 * arm comes from the injected `Randomness` keyed by the trial seed and the
 * ticket, so re-running a trial never changes an assignment.
 */
export function draw(trial: Trial, issueId: string, randomness: Randomness): TrialAssignment {
  return {
    trialId: trial.id,
    issueId,
    arm: randomness.drawArm(trial.seed, issueId),
    complied: true,
    excludedReason: '',
  };
}

/**
 * True when the ticket actually worked the drawn arm; otherwise it leaves the
 * trial with its reason (SPEC §11 step 3, recipe 16).
 */
export function enforceCompliance(
  assignment: TrialAssignment,
  actualArm: Arm,
): TrialAssignment {
  if (assignment.arm === actualArm) {
    return { ...assignment, complied: true, excludedReason: '' };
  }
  return {
    ...assignment,
    complied: false,
    excludedReason: `tirage non respecté : bras tiré ${assignment.arm}, traité en ${actualArm}`,
  };
}

/**
 * Why the trial stops, in the order of SPEC §11 step 4: the gap is established,
 * the planned date is reached, or one arm piles up reopenings (safety stop,
 * threshold tuneable via `REOPENING_STOP_THRESHOLD`). Empty string: it runs on.
 */
export function stopReason(
  trial: Trial,
  now: string,
  gapEstablished: boolean,
  reopenings: Readonly<Record<Arm, number>>,
): string {
  if (gapEstablished) return 'écart établi';
  if (now >= trial.endsAt) return 'durée prévue atteinte';
  const worst = ARMS.filter((arm) => reopenings[arm] >= REOPENING_STOP_THRESHOLD);
  if (worst.length > 0) return `réouvertures excessives : bras ${worst[0]}`;
  return '';
}

/* ------------------------------------------------- sized and corrected trial */

/** What one look at a running trial brings (SPEC §11 step 4). */
export interface TrialLook {
  /** How many looks the trial planned, so the boundaries are the planned ones. */
  readonly plannedLooks: number;
  /** Test statistics of the previous looks, oldest first. */
  readonly looks: readonly number[];
  /** Test statistic observed at the current look. */
  readonly zObserved: number;
  /** Share of the planned information available now, in [0, 1]. */
  readonly informationFraction: number;
  readonly reopeningsAgent: number;
  readonly reopeningsHuman: number;
}

/**
 * Whether the team's ticket flow can carry an honest trial: with the effect
 * the trial must detect, the plan says the size it needs and says "not
 * feasible here" when the flow is too slow; without it, the window sets the
 * size and the plan reports the effect that size can detect (SPEC §11, DP-27).
 */
export function planTrial(
  baselineRate: number,
  ticketsPerWeek: number,
  mde?: number,
  weeks?: number,
): PowerPlan {
  const sized: TrialPlanInput = mde === undefined ? { baselineRate, ticketsPerWeek } : { baselineRate, ticketsPerWeek, mde };
  return trialPlan(weeks === undefined ? sized : { ...sized, weeks });
}

/**
 * One corrected look at the trial: the O'Brien-Fleming boundaries make daily
 * looks honest (efficacy only past the boundary of the current look), and the
 * safety stop on the agent arm has priority over everything (SPEC §11 step 4).
 */
export function lookAtTrial(look: TrialLook): LookDecision {
  return evaluateLook({
    looks: look.looks,
    zObserved: look.zObserved,
    informationFraction: look.informationFraction,
    boundaries: obrienFlemingBoundaries(look.plannedLooks),
    reopeningsAgent: look.reopeningsAgent,
    reopeningsHuman: look.reopeningsHuman,
    safetyThreshold: REOPENING_STOP_THRESHOLD,
  });
}