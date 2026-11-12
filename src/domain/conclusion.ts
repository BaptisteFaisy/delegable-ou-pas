/**
 * The four conclusions of a comparison, and the order in which they are
 * arbitrated: sample size, then unbalanced arms, then the difference interval
 * — established gap (`better`/`worse`) or not (`same`).
 *
 * Realises SPEC §7 rule 4 (better, same, worse, and "we do not know", which is
 * a conclusion in its own right, never an error case), SPEC §7 rule 5 (arms
 * that differ too much forbid any conclusion), SPEC §20 and §21 ("a favourable
 * total with unfavourable cohorts": a conclusion is always per cohort, this
 * module only ever receives one pair of arms).
 * DP-09.
 *
 * Corrects the merged defect: "same" used to be concluded whenever two Wilson
 * intervals overlapped; overlapping intervals can still hide an established
 * difference. The arbiter is the Newcombe interval on `rateA - rateB`: when it
 * excludes 0 the gap is established (`better`/`worse`); when it contains 0 the
 * gap is not established and the conclusion is `same` (SPEC §7 rule 4: the
 * vocabulary is "écart établi" / "écart non établi"). "We do not know" is
 * reserved for the cases of SPEC §8 row 4 — an arm below the threshold or
 * unbalanced arms — never for a wide interval centred on 0: the SPEC §8 card
 * (PROJ-412, 69 % [50 ; 84] vs 87 % [71 ; 95], median delay 1,5 d vs 3 d)
 * recommends "agent, relecture renforcée" with "confiance moyenne", which only
 * a `same` conclusion produces (see `difference.ts`, METHODE.md §6, §12).
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock.
 */

import type { Balance, Conclusion, ProportionStat } from '../types.js';
import { newcombeDifference } from './difference.js';
import { DEFAULT_MIN_ARM_SIZE } from './stats.js';
import type { DurationInterval } from './stats.js';

/** How a conclusion is worded on screen (SPEC §7 rule 4). */
export type GapWording = 'écart établi' | 'écart non établi';

/** Wording of an established gap: the two intervals do not overlap. */
export const GAP_ESTABLISHED: GapWording = 'écart établi';

/** Wording when the gap is not established: overlapping intervals, or too few tickets. */
export const GAP_NOT_ESTABLISHED: GapWording = 'écart non établi';

/**
 * A conclusion as it is rendered: the verdict, its wording, and the proof
 * flag. `proven` is always `false` here — the word "prouvé" is reserved for
 * the controlled trial (SPEC §11), never for an observed cohort.
 */
export interface ConclusionWording {
  readonly conclusion: Conclusion;
  readonly gap: GapWording;
  readonly proven: false;
}

/** Which way a duration counts as an improvement. */
export type DurationDirection = 'higher-is-better' | 'lower-is-better';

/** True when the arm carries a rate measured on at least `minArmSize` tickets. */
function isUsable(stat: ProportionStat | null, minArmSize: number): stat is ProportionStat {
  return stat !== null && stat.n >= minArmSize;
}

/**
 * True when an arm is missing or too thin to conclude on (SPEC §7 rule 2).
 * The threshold is a parameter, defaulting to 20 tickets per arm.
 */
export function belowThreshold(
  stat: ProportionStat | null,
  minArmSize: number = DEFAULT_MIN_ARM_SIZE,
): boolean {
  return !isUsable(stat, minArmSize);
}

/** Anything bounded by an interval: a proportion or a median duration. */
interface IntervalBound {
  readonly ciLow: number;
  readonly ciHigh: number;
}

/** Shared overlap test: touching bounds count as an overlap (SPEC §7 rule 4). */
function boundsOverlap(a: IntervalBound, b: IntervalBound): boolean {
  return a.ciLow <= b.ciHigh && b.ciLow <= a.ciHigh;
}

/**
 * True when the two intervals share at least one value. Touching bounds count
 * as an overlap. This predicate is a diagnostic of the raw intervals; it is no
 * longer the arbiter of an established gap for proportions — the difference
 * interval is (see `difference.ts`, METHODE.md).
 */
export function intervalsOverlap(a: ProportionStat, b: ProportionStat): boolean {
  return boundsOverlap(a, b);
}

/**
 * Compares two arms of one cohort (SPEC §7 rules 2, 4 and 5).
 *
 * Arbitration order, non negotiable: sample size first, then balance of the
 * arms, then the difference interval (Newcombe). An interval of the difference
 * that excludes 0 is `better`/`worse` by its sign — an established gap; an
 * interval that contains 0 is `same` — "écart non établi" (SPEC §7 rule 4).
 * `not-enough-data` answers the cases of SPEC §8 row 4 only: an arm missing or
 * below the threshold (SPEC §7 rule 2, recipe 6), or unbalanced arms (rule 5,
 * recipe 7) — never a wide interval centred on 0, which the SPEC §8 card
 * (PROJ-412) recommends as "agent, relecture renforcée" via `same`. TOST
 * equivalence (`difference.ts`) stays available to word a project's own
 * equivalence margin; it does not gate the conclusion.
 */
export function conclude(
  agent: ProportionStat | null,
  human: ProportionStat | null,
  minArmSize: number = DEFAULT_MIN_ARM_SIZE,
  balance: Balance,
): Conclusion {
  if (!isUsable(agent, minArmSize) || !isUsable(human, minArmSize)) return 'not-enough-data';
  if (!balance.balanced) return 'not-enough-data';
  const difference = newcombeDifference(agent, human);
  if (difference.established) return difference.diff > 0 ? 'better' : 'worse';
  return 'same';
}

/**
 * Compares two median durations with the very same rule as proportions: the
 * gap is established only when the intervals do not overlap (SPEC §7 rule 4).
 * The direction of the metric is a parameter, because a shorter lead time and
 * a higher cleanliness are not "better" in the same direction.
 */
export function concludeDurations(
  agent: DurationInterval | null,
  human: DurationInterval | null,
  minArmSize: number,
  balance: Balance,
  direction: DurationDirection,
): Conclusion {
  if (agent === null || human === null) return 'not-enough-data';
  if (agent.n < minArmSize || human.n < minArmSize) return 'not-enough-data';
  if (!balance.balanced) return 'not-enough-data';
  if (boundsOverlap(agent, human)) return 'same';
  const agentWins =
    direction === 'higher-is-better' ? agent.medianH > human.medianH : agent.medianH < human.medianH;
  return agentWins ? 'better' : 'worse';
}

/** Words a conclusion for the screens: verdict, wording, proof flag (SPEC §7 rule 4). */
export function wording(conclusion: Conclusion): ConclusionWording {
  const established = conclusion === 'better' || conclusion === 'worse';
  return {
    conclusion,
    gap: established ? GAP_ESTABLISHED : GAP_NOT_ESTABLISHED,
    proven: false,
  };
}

/** True when the gap is established, i.e. when the intervals are disjoint. */
export function gapEstablished(conclusion: Conclusion): boolean {
  return wording(conclusion).gap === GAP_ESTABLISHED;
}
