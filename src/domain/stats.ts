/**
 * Honest statistics: the Wilson interval, the medians, and the few shared
 * helpers every other lot calls instead of recomputing a range.
 *
 * Realises SPEC §7 rule 3 (a rate always carries its sample size and its
 * interval), SPEC §20 (missing data is normal: `null`, `0`, never an
 * exception), METHODE.md §1 (Wilson score interval, z = 1.96) and §2 (the
 * three games of the specification fall out of Wilson, not of Wald).
 * DP-08, DP-09.
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock.
 */

import type { DurationStat, ProportionStat } from '../types.js';

/** Quantile of the normal law for a 95 % confidence (METHODE.md §1). */
export const Z_95: number = 1.96;

/** Default sample size required per arm before any conclusion (SPEC §7 rule 2). */
export const DEFAULT_MIN_ARM_SIZE: number = 20;

/** A duration together with the interval that bounds its median. */
export interface DurationInterval extends DurationStat {
  /** Lower bound of the median interval, in hours. */
  readonly ciLow: number;
  /** Upper bound of the median interval, in hours. */
  readonly ciHigh: number;
}

/** Keeps a fraction inside [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  return value > 1 ? 1 : value;
}

/**
 * Wilson score interval for `successes` out of `n` trials (METHODE.md §1).
 *
 * `n = 0` is not an error: it renders `{ n: 0, rate: 0, ciLow: 0, ciHigh: 1 }`,
 * the honest way of saying "nothing measured yet" (SPEC §20, recipe 10).
 */
export function wilsonInterval(successes: number, n: number): ProportionStat {
  if (n <= 0) return { n: 0, rate: 0, ciLow: 0, ciHigh: 1 };
  const p = clamp01(successes / n);
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const spread = Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const margin = (Z_95 / denominator) * spread;
  return {
    n,
    rate: p,
    ciLow: clamp01(centre - margin),
    ciHigh: clamp01(centre + margin),
  };
}

/**
 * The only way this codebase renders a proportion: with its sample size and
 * its interval, never a bare rate (SPEC §7 rule 3, recipe 10).
 */
export function proportion(successes: number, n: number): ProportionStat {
  return wilsonInterval(successes, n);
}

/**
 * Median of a list of numbers: a median, never a mean (SPEC §6, METHODE.md §3).
 * An empty list renders `0`; the sample size carried next to it says so.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Median, or `null` when there is nothing to measure (SPEC §20). */
export function medianOrNull(values: readonly number[]): number | null {
  return values.length === 0 ? null : median(values);
}

/** Median duration in hours, always with its sample size (SPEC §6, §7). */
export function medianDuration(hours: readonly number[]): DurationStat {
  return { n: hours.length, medianH: median(hours) };
}

/**
 * Probability that a fair coin lands heads up at most `k` times in `n` throws.
 * Used by the distribution-free interval of a median; `n` stays small enough
 * for the term recurrence to be exact in double precision.
 */
function binomialLowerTail(n: number, k: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  let term = Math.pow(2, -n);
  let sum = term;
  for (let i = 1; i <= k; i += 1) {
    term = (term * (n - i + 1)) / i;
    sum += term;
  }
  return sum;
}

/**
 * Index (1-based) of the order statistic that opens the 95 % interval of the
 * median: the widest index whose two binomial tails stay under alpha / 2.
 */
function medianOrderIndex(n: number): number {
  const halfAlpha = 0.025;
  let index = 1;
  for (let k = 1; k <= Math.floor(n / 2); k += 1) {
    if (binomialLowerTail(n, k - 1) > halfAlpha) break;
    index = k;
  }
  return index;
}

/**
 * Median duration with the distribution-free interval that bounds it.
 *
 * `DurationStat` is frozen and carries no interval, so the range needed to
 * compare two medians is computed here from the order statistics: no
 * resampling, no randomness, no hypothesis on the shape of the distribution.
 * An empty list renders a zeroed stat (`n = 0` says "nothing measured").
 */
export function medianInterval(hours: readonly number[]): DurationInterval {
  if (hours.length === 0) return { n: 0, medianH: 0, ciLow: 0, ciHigh: 0 };
  const sorted = [...hours].sort((a, b) => a - b);
  const index = medianOrderIndex(sorted.length);
  return {
    n: sorted.length,
    medianH: median(sorted),
    ciLow: sorted[index - 1],
    ciHigh: sorted[sorted.length - index],
  };
}

/** Share of `part` inside `whole`, in [0, 1]; `0` when there is no whole. */
export function share(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return clamp01(part / whole);
}

/**
 * Formats a fraction as a percentage ("83 %"): a rate is never displayed
 * alone, it comes with its sample size and its interval (SPEC §7 rule 3).
 */
export function percent(value: number): string {
  return `${Math.round(clamp01(value) * 100)} %`;
}
