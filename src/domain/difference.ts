/**
 * The gap between two arms is tested on the difference of their rates, never
 * on the overlap of their intervals (METHODE.md « L'écart se teste sur la
 * différence », SPEC §7 rule 4).
 *
 * Two overlapping 95 % Wilson intervals can still hide a significant
 * difference: overlap is not the right arbiter. This module produces a
 * **Newcombe interval** (method 10, hybrid score) for `rateA - rateB`, built
 * from the two Wilson intervals already computed by `stats.ts`, and a
 * **two one-sided test (TOST)** that establishes equivalence only while the
 * whole difference interval stays inside `[-margin, +margin]`.
 *
 * Corrects the merged defect: `conclusion.ts` used to say "same" whenever the
 * two Wilson intervals overlapped. Two intervals that overlap can still be far
 * enough apart for the difference to be established.
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock.
 */

import type { ProportionStat } from '../types.js';

/** Default equivalence margin: 10 points of clean-close rate (SPEC §7 rule 4). */
export const DEFAULT_EQUIVALENCE_MARGIN: number = 0.10;

/**
 * The established-or-not answer about `rateA - rateB`, without guessing when
 * the data is too thin: the interval says it all (SPEC §20 "on ne sait pas").
 */
export interface DifferenceStat {
  readonly nA: number;
  readonly nB: number;
  readonly rateA: number;
  readonly rateB: number;
  /** `rateA - rateB`, in [-1, 1]. */
  readonly diff: number;
  /** Lower bound of the Newcombe interval on the difference. */
  readonly ciLow: number;
  /** Upper bound of the Newcombe interval on the difference. */
  readonly ciHigh: number;
  /** True when the interval excludes 0 (an established gap). */
  readonly established: boolean;
}

/**
 * Newcombe method 10 (hybrid score): a confidence interval for the difference
 * of two proportions, assembled from the two Wilson intervals carried by the
 * `ProportionStat`s — never recomputed here (zero duplication, `stats.ts` owns
 * Wilson). See METHODE.md « L'écart se teste sur la différence ».
 */
export function newcombeDifference(a: ProportionStat, b: ProportionStat): DifferenceStat {
  const diff = a.rate - b.rate;
  const lowerSpan = Math.hypot(a.rate - a.ciLow, b.ciHigh - b.rate);
  const upperSpan = Math.hypot(a.ciHigh - a.rate, b.rate - b.ciLow);
  const ciLow = diff - lowerSpan;
  const ciHigh = diff + upperSpan;
  return {
    nA: a.n,
    nB: b.n,
    rateA: a.rate,
    rateB: b.rate,
    diff,
    ciLow,
    ciHigh,
    established: ciLow > 0 || ciHigh < 0,
  };
}

/**
 * The answer of the equivalence test: `equivalent` is true only while the whole
 * difference interval sits inside `[-margin, +margin]` (two one-sided tests).
 */
export interface EquivalenceResult {
  readonly equivalent: boolean;
  readonly margin: number;
  readonly diff: number;
  readonly ciLow: number;
  readonly ciHigh: number;
}

/**
 * TOST equivalence: `rateA` and `rateB` are "the same" only when the whole
 * Newcombe interval is inside `[-margin, +margin]`. `margin` defaults to
 * `DEFAULT_EQUIVALENCE_MARGIN` and is adjustable per project (METHODE.md).
 */
export function tostEquivalence(
  a: ProportionStat,
  b: ProportionStat,
  margin: number = DEFAULT_EQUIVALENCE_MARGIN,
): EquivalenceResult {
  const stat = newcombeDifference(a, b);
  return {
    equivalent: stat.ciLow >= -margin && stat.ciHigh <= margin,
    margin,
    diff: stat.diff,
    ciLow: stat.ciLow,
    ciHigh: stat.ciHigh,
  };
}