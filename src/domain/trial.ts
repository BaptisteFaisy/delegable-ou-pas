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