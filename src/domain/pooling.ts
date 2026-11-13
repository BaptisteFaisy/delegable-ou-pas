/**
 * Hierarchical Bayesian pooling: what a small cohort learns from its siblings
 * of the same nature (feature E3).
 *
 * The problem this module answers: 58 % of the map is grey because a cohort
 * of 12 tickets says almost nothing on its own. Pooling aggregates the
 * information of the cohorts of the same nature — without ever cheating: the
 * pooled interval is NEVER narrower than the cohort's own interval, and the
 * share of borrowed strength travels with the figure.
 *
 * Realises SPEC §7 rule 2 (a cohort below the conclusive size cannot conclude
 * alone), §7 rule 3 (a rate always with its sample size and its interval),
 * §12 ("the map" and its grey cells), §20 (a rate never alone, missing data is
 * normal data). DP-08, DP-09, DP-17.
 *
 * The model, in full, computed on the spot (no dependency, no statistics
 * package):
 * - the prior is EMPIRICAL: the mean and the standard deviation of the
 *   sibling cohorts' rates (same nature), plus the number of cohorts it rests
 *   on and a tunable strength;
 * - the borrowed weight is the normal-normal weight `tau^2 / (tau^2 + sigma^2)`,
 *   where `tau^2` is the variance of the cohort's own estimate (the Wilson
 *   variance, the one the interval of `stats.ts` already uses) and `sigma^2`
 *   the dispersion of the prior, inflated by the uncertainty of its own mean
 *   (`1 + 1/m`) and divided by the strength;
 * - the pooled rate is the own rate pulled toward the prior by that weight;
 * - the pooled interval NEVER shrinks: it is the union of the own interval and
 *   the pooled one, widened by the uncertainty that was borrowed.
 *
 * What this module does NOT prove: that two cohorts of the same nature behave
 * alike — the prior is a measured dispersion of the siblings, nothing more; it
 * does not turn a cohort into a conclusion either: the borrowed share is
 * published so a reader can weigh the figure.
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock
 * (`Date.now()`), no `Math.random()`. Deterministic.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { ProportionStat } from '../types.js';
import { DEFAULT_MIN_ARM_SIZE, Z_95, proportion } from './stats.js';

/**
 * Dispersion used when the prior has no measurable spread (a single sibling,
 * or siblings that all agree exactly): a quarter of the scale, so a prior that
 * knows nothing keeps its share small instead of swallowing the cohort.
 */
export const DEFAULT_PRIOR_SD: number = 0.25;

/** Default strength of a prior: as strong as the measured dispersion allows. */
export const DEFAULT_PRIOR_STRENGTH: number = 1;

/**
 * The prior of a nature: what the sibling cohorts of that nature say.
 *
 * `observations` counts the sibling cohorts the prior rests on (one
 * observation = one cohort rate); `strength` is the tunable knob (0 = nothing
 * borrowed, 1 = as strong as the evidence allows).
 */
export interface PriorSpec {
  /** Mean of the sibling cohorts' rates (empirical, computed on the spot). */
  readonly mean: number;
  /** Standard deviation of the sibling cohorts' rates (empirical). */
  readonly sd: number;
  /** Tunable strength of the prior: 0 = nothing borrowed, 1 = full strength. */
  readonly strength: number;
  /** Number of sibling cohorts the prior rests on (one observation = one cohort). */
  readonly observations: number;
}

/** What a cohort knows alone, and what it knows once pooled with its siblings. */
export interface PooledEstimate {
  /** The cohort's own proportion, untouched. */
  readonly own: ProportionStat;
  /** The pooled proportion: a rate with its sample size and its interval. */
  readonly pooled: ProportionStat;
  /** Share of the borrowed strength: 0 = nothing borrowed, 1 = everything borrowed. */
  readonly borrowedStrength: number;
  /** True when the own rate has been pulled toward the prior (the shrinkage). */
  readonly shrunk: boolean;
  /** The sentence that says what was borrowed, in both languages (SPEC §16). */
  readonly note: { readonly fr: string; readonly en: string };
}

/** One cohort to pool, with the prior of its nature. */
export interface PoolingInput {
  /** The key of the cohort (nature × zone × size). */
  readonly cohortKey: string;
  /** What the cohort measured on its own. */
  readonly own: ProportionStat;
  /** The prior of its nature, measured on the sibling cohorts. */
  readonly prior: PriorSpec;
}

/** Keeps a fraction inside [0, 1]. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return value > 1 ? 1 : value;
}

/** The mean of a list of rates (0 when the list is empty). */
function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

/** The sample standard deviation (n - 1) of a list of rates; 0 below two values. */
function sdOf(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = meanOf(values);
  const squares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(squares / (values.length - 1));
}

/**
 * The prior of a nature, measured on the sibling cohorts: the mean and the
 * standard deviation of their rates, computed on the spot.
 *
 * Cohorts without a ticket are ignored: they say nothing about the spread
 * (SPEC §20, missing data is normal, never an error). The result does not
 * depend on the order of the cohorts: the same family always yields the same
 * prior.
 */
export function empiricalPrior(
  cohorts: readonly { readonly clean: number; readonly total: number }[],
): PriorSpec {
  const rates = cohorts
    .filter((cohort) => cohort.total > 0)
    .map((cohort) => clamp01(cohort.clean / cohort.total));
  return {
    mean: clamp01(meanOf(rates)),
    sd: sdOf(rates),
    strength: DEFAULT_PRIOR_STRENGTH,
    observations: rates.length,
  };
}

/**
 * The variance of the cohort's own estimate: the Wilson variance, the one the
 * interval of `stats.ts` already uses, so the weight borrowed and the
 * interval published are computed on the same scale.
 */
function ownVariance(n: number, rate: number): number {
  if (n <= 0) return 0;
  const p = clamp01(rate);
  return (p * (1 - p)) / n + (Z_95 * Z_95) / (4 * n * n);
}

/**
 * The dispersion of the prior, seen from a new cohort: the spread between the
 * siblings plus the uncertainty of their own mean (`1 + 1/m`), divided by the
 * strength. `Infinity` when the strength is zero: nothing is borrowed.
 */
function priorDispersion(prior: PriorSpec, strength: number): number {
  if (strength <= 0) return Number.POSITIVE_INFINITY;
  const cohorts = Math.max(1, Math.floor(prior.observations));
  const spread = prior.sd > 0 ? prior.sd : DEFAULT_PRIOR_SD;
  return (spread * Math.sqrt(1 + 1 / cohorts)) / strength;
}

/**
 * The share of the strength borrowed from the prior: the normal-normal weight
 * `tau^2 / (tau^2 + sigma^2)`.
 *
 * It is zero in three cases: a cohort with no ticket, a prior switched off,
 * and a cohort big enough to conclude on its own (SPEC §7 rule 2:
 * `DEFAULT_MIN_ARM_SIZE` tickets — there is nothing to borrow). Below that
 * size it grows as the cohort shrinks: the smaller the cohort, the more it has
 * to borrow.
 */
function borrowedWeight(n: number, rate: number, sigma: number): number {
  if (n <= 0 || !Number.isFinite(sigma) || sigma <= 0) return 0;
  if (n >= DEFAULT_MIN_ARM_SIZE) return 0;
  const tau2 = ownVariance(n, rate);
  if (tau2 <= 0) return 0;
  return clamp01(tau2 / (tau2 + sigma * sigma));
}

/**
 * The sentence that says what was borrowed, in both languages (SPEC §16).
 *
 * Three cases, all said out loud: nothing to pool, nothing borrowed, or a
 * share of the strength taken from the sibling cohorts.
 */
function poolingNote(
  own: ProportionStat,
  borrowed: number,
  prior: PriorSpec,
): { readonly fr: string; readonly en: string } {
  if (own.n <= 0) {
    return {
      fr: "Aucun ticket dans cette cohorte : rien à emprunter, rien à conclure.",
      en: 'No ticket in this cohort: nothing to borrow, nothing to conclude.',
    };
  }
  if (borrowed <= 0) {
    return {
      fr: `Rien n'est emprunté : les ${own.n} tickets de cette cohorte se suffisent à eux-mêmes.`,
      en: `Nothing is borrowed: the ${own.n} tickets of this cohort are enough on their own.`,
    };
  }
  const share = Math.round(borrowed * 100);
  const siblings = Math.max(0, Math.floor(prior.observations));
  const frSiblings = `${siblings} ${siblings === 1 ? 'cohorte' : 'cohortes'}`;
  const enSiblings = `${siblings} ${siblings === 1 ? 'cohort' : 'cohorts'}`;
  return {
    fr: `Sur ${own.n} tickets, ${share} % de la force est empruntée aux ${frSiblings} de même nature : la fourchette est plus large, le taux est moins affirmatif.`,
    en: `Over ${own.n} tickets, ${share} % of the strength is borrowed from the ${enSiblings} of the same nature: the interval is wider, the rate is less assertive.`,
  };
}

/**
 * Pools one cohort with the prior of its nature.
 *
 * The result is a proportion built with `proportion()` (so it always carries
 * its sample size and its interval), then widened by the safety rule: the
 * pooled interval contains the own interval, never less. The strength can be
 * overridden per call; `prior.strength` is the default.
 */
export function poolProportion(
  own: ProportionStat,
  prior: PriorSpec,
  strength?: number,
): PooledEstimate {
  const used = clamp01(strength ?? prior.strength);
  const sigma = priorDispersion(prior, used);
  const borrowed = borrowedWeight(own.n, own.rate, sigma);
  const ownRate = clamp01(own.rate);
  const pooledRate = clamp01((1 - borrowed) * ownRate + borrowed * clamp01(prior.mean));
  const raw = proportion(pooledRate * own.n, own.n);
  const widening = Number.isFinite(sigma) ? borrowed * sigma : 0;
  const pooled: ProportionStat = {
    n: raw.n,
    rate: raw.rate,
    ciLow: clamp01(Math.min(own.ciLow, raw.ciLow) - widening),
    ciHigh: clamp01(Math.max(own.ciHigh, raw.ciHigh) + widening),
  };
  return {
    own,
    pooled,
    borrowedStrength: borrowed,
    shrunk: Math.abs(pooled.rate - ownRate) > 1e-9,
    note: poolingNote(own, borrowed, prior),
  };
}

/**
 * Pools a list of cohorts, each with the prior of its own nature.
 *
 * The answers come back in the order of the inputs: one estimate per cohort,
 * never more, never fewer.
 */
export function poolCohorts(
  inputs: readonly PoolingInput[],
  strength?: number,
): readonly PooledEstimate[] {
  return inputs.map((input) => poolProportion(input.own, input.prior, strength));
}
