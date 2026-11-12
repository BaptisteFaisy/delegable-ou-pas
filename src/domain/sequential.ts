/**
 * Sequential boundaries of the controlled trial (SPEC §11, DP-27).
 *
 * The controlled trial is the only figure the app may call "proved"
 * (SPEC §7, SPEC §11 step 5). Looking at the data every day without
 * correcting for the looks inflates the false positives: five looks at
 * z = 1.8 each reach p < 0.05 on their own, and the family-wise error of
 * that habit is about 17 %. The O'Brien-Fleming boundaries spend the alpha
 * once and for all: the first look has to be extreme, the last one falls
 * back on the fixed sample test.
 *
 * The alpha spent is cumulative and never exceeds the total alpha. The
 * safety rule comes from SPEC §11 step 4: the trial stops when an arm piles
 * up the reopenings.
 *
 * The domain is pure: no `@forge/*`, no clock, no randomness. The normal
 * law comes from `power.ts`, which implements it without any dependency.
 */

import { DEFAULT_ALPHA, normalCdf, normalQuantile, normalUpperTail } from './power.js';

/**
 * Reopenings above which an arm stops the trial (SPEC §11 step 4).
 *
 * Same threshold as the trial module of the lot L4: the agent arm is the
 * one watched here, the human arm is the reference.
 */
export const DEFAULT_SAFETY_REOPENING_THRESHOLD: number = 3;

/**
 * Conditional power under which the trial stops for futility (SPEC §11).
 *
 * The rule is non-binding and explicit: when the data collected so far make
 * the significance unreachable whatever happens next, continuing wastes the
 * team's tickets.
 */
export const DEFAULT_FUTILITY_CONDITIONAL_POWER: number = 0.10;

/** A look of the sequential plan: where it stands and what it costs. */
export interface SequentialBoundary {
  /** Rank of the look, 1-based. */
  readonly look: number;
  /** Share of the information available at this look, in [0, 1]. */
  readonly informationFraction: number;
  /** Boundary of the test statistic at this look. */
  readonly zBoundary: number;
  /** Alpha spent *by* this look, incremental (the sum stays under alpha). */
  readonly alphaSpent: number;
}

/** Why the trial stops at a look. */
export type StopReason = 'efficacy' | 'futility' | 'safety' | 'continue';

/** The decision taken at a look. */
export interface LookDecision {
  /** What the look concludes. */
  readonly stop: StopReason;
  /** Why, in words the app can display. */
  readonly reason: string;
  /** Test statistic observed at this look. */
  readonly zObserved: number;
  /** Boundary that applied at this look. */
  readonly boundary: number;
  /** Alpha spent from the first look to this one. */
  readonly alphaSpentTotal: number;
}

/** Input of `evaluateLook`. */
export interface LookInput {
  /** Test statistics of the previous looks, oldest first. */
  readonly looks: readonly number[];
  /** Test statistic observed at the current look. */
  readonly zObserved: number;
  /** Share of the information available at the current look, in [0, 1]. */
  readonly informationFraction: number;
  /** Planned boundaries of the sequential test. */
  readonly boundaries: readonly SequentialBoundary[];
  /** Reopenings of the agent arm so far. */
  readonly reopeningsAgent?: number;
  /** Reopenings of the human arm so far. */
  readonly reopeningsHuman?: number;
  /** Reopenings above which the trial stops for safety. */
  readonly safetyThreshold?: number;
}

/** Keeps a fraction inside [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  return value > 1 ? 1 : value;
}

/**
 * O'Brien-Fleming boundaries for `looks` looks (SPEC §11).
 *
 * The boundary of a look at information fraction `t` is
 * `z(1 - alpha/2) / sqrt(t)`: very high on the first looks, back to
 * `z(1 - alpha/2)` on the last one. The alpha spent follows the
 * O'Brien-Fleming spending function `2 * (1 - Phi(boundary))`, and what is
 * rendered is the *increment* of that function: the sum of the increments
 * is the total alpha, never more.
 */
export function obrienFlemingBoundaries(
  looks: number,
  alpha: number = DEFAULT_ALPHA,
): readonly SequentialBoundary[] {
  const total = Math.floor(looks);
  if (!Number.isFinite(total) || total < 1) return [];
  const critical = normalQuantile(1 - alpha / 2);
  const boundaries: SequentialBoundary[] = [];
  let spentBefore = 0;
  for (let look = 1; look <= total; look += 1) {
    const informationFraction = look / total;
    const zBoundary = critical / Math.sqrt(informationFraction);
    const cumulative = 2 * normalUpperTail(zBoundary);
    const alphaSpent = Math.max(0, cumulative - spentBefore);
    spentBefore = cumulative;
    boundaries.push({ look, informationFraction, zBoundary, alphaSpent });
  }
  return boundaries;
}

/**
 * Safety stop of the controlled trial (SPEC §11 step 4).
 *
 * The trial stops when the agent arm piles up the reopenings: on its own
 * (the rule of the trial module) or because it exceeds the human arm by
 * more than the threshold. The threshold is tuneable; a threshold of zero
 * keeps only the comparison between the arms.
 */
export function safetyStop(
  reopeningsAgent: number,
  reopeningsHuman: number,
  threshold: number = DEFAULT_SAFETY_REOPENING_THRESHOLD,
): boolean {
  const agent = Number.isFinite(reopeningsAgent) ? Math.max(0, reopeningsAgent) : 0;
  const human = Number.isFinite(reopeningsHuman) ? Math.max(0, reopeningsHuman) : 0;
  const limit = Number.isFinite(threshold) ? Math.max(0, threshold) : 0;
  if (limit <= 0) return agent > human;
  return agent >= limit || agent - human > limit;
}

/**
 * Boundary that applies to the current look: the planned one when the
 * ranks match, otherwise the last boundary the information fraction allows.
 */
function boundaryForLook(
  boundaries: readonly SequentialBoundary[],
  look: number,
  informationFraction: number,
): SequentialBoundary | null {
  if (boundaries.length === 0) return null;
  const planned = boundaries.find((boundary) => boundary.look === look);
  if (planned) return planned;
  const reached = boundaries.filter((boundary) => boundary.informationFraction <= informationFraction);
  return reached.length > 0 ? reached[reached.length - 1] : boundaries[0];
}

/** Alpha spent from the first look to the current one. */
function alphaSpentUpTo(boundaries: readonly SequentialBoundary[], look: number): number {
  return boundaries
    .filter((boundary) => boundary.look <= look)
    .reduce((total, boundary) => total + boundary.alphaSpent, 0);
}

/**
 * Conditional power of reaching significance if the remaining information
 * behaves like the data collected so far (SPEC §11).
 */
function conditionalPower(z: number, informationFraction: number, critical: number): number {
  const fraction = clamp01(informationFraction);
  if (fraction <= 0) return 0;
  if (fraction >= 1) return normalCdf(z - critical);
  const root = Math.sqrt(fraction);
  const expected = z * (root + Math.sqrt(1 - fraction) / root);
  return normalCdf((expected - critical) / Math.sqrt(1 - fraction));
}

/**
 * Decision of a look of the controlled trial (SPEC §11, DP-27).
 *
 * The efficacy can only be concluded beyond the boundary of the *current*
 * look: without that correction, looking every day would declare an effect
 * that the trial never produced. The safety rule (SPEC §11 step 4) has
 * priority over everything: a trial that hurts the team stops.
 */
export function evaluateLook(input: LookInput): LookDecision {
  const look = input.looks.length + 1;
  const critical = normalQuantile(1 - DEFAULT_ALPHA / 2);
  const boundary = boundaryForLook(input.boundaries, look, input.informationFraction);
  const zBoundary = boundary ? boundary.zBoundary : Number.POSITIVE_INFINITY;
  const alphaSpentTotal = alphaSpentUpTo(input.boundaries, look);
  const base = {
    zObserved: input.zObserved,
    boundary: zBoundary,
    alphaSpentTotal,
  };
  const stopped = safetyStop(
    input.reopeningsAgent ?? 0,
    input.reopeningsHuman ?? 0,
    input.safetyThreshold ?? DEFAULT_SAFETY_REOPENING_THRESHOLD,
  );
  if (stopped) {
    return {
      ...base,
      stop: 'safety',
      reason: `réouvertures excessives sur le bras agent : arrêt de sécurité (SPEC §11 étape 4)`,
    };
  }
  if (input.zObserved >= zBoundary) {
    return {
      ...base,
      stop: 'efficacy',
      reason: `écart établi au regard ${look} : z = ${input.zObserved.toFixed(2)} franchit la frontière ${zBoundary.toFixed(2)}`,
    };
  }
  if (input.zObserved <= -zBoundary) {
    return {
      ...base,
      stop: 'futility',
      reason: `le bras agent fait moins bien (z = ${input.zObserved.toFixed(2)}) : l'hypothèse est réfutée dans l'autre sens`,
    };
  }
  const reached = conditionalPower(input.zObserved, input.informationFraction, critical);
  if (reached < DEFAULT_FUTILITY_CONDITIONAL_POWER) {
    return {
      ...base,
      stop: 'futility',
      reason: `plus aucune chance d'atteindre la significativité (puissance conditionnelle ${(reached * 100).toFixed(0)} %)`,
    };
  }
  return {
    ...base,
    stop: 'continue',
    reason: `le regard ${look} ne franchit pas la frontière : z = ${input.zObserved.toFixed(2)} contre ${zBoundary.toFixed(2)}`,
  };
}