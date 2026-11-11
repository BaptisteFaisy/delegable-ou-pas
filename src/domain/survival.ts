/**
 * Survival analysis of the lead time (SPEC §6 « Délai », DP-04).
 *
 * SPEC §6 admits — without solving it — the trap of comparing lead-time medians
 * while « forgotten still-open tickets » bias the figure: an arm that leaves
 * more tickets open looks faster. Kaplan-Meier censors still-open tickets
 * properly (a censored duration contributes to the risk set, never to a
 * survival drop), and the log-rank test decides whether two survival curves
 * really differ (hypergeometric variance, then the upper tail of a chi-squared
 * with one degree of freedom, computed here with no dependency).
 *
 * The delays are NOT measured here: `src/domain/outcome.ts` turns status
 * histories into hours (SPEC §6, DP-04). This module consumes the resulting
 * observations — a duration in hours plus whether the ticket ever closed
 * (`event` true) or is still open (`event` false, censored).
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock, no
 * randomness. Deterministic by construction.
 */

import { share } from './stats.js';

/** A duration (hours) with its fate: closed (`event`), or still open (censored). */
export interface SurvivalObservation {
  readonly durationH: number;
  /** `true` when the ticket closed (the delay is complete); `false` = censored. */
  readonly event: boolean;
}

/** One step of a Kaplan-Meier curve: a time where something closed (SPEC §6, DP-04). */
export interface SurvivalPoint {
  readonly t: number;
  readonly atRisk: number;
  readonly events: number;
  readonly survival: number;
}

/** The whole Kaplan-Meier curve, its censoring count and its median (SPEC §6, DP-04). */
export interface SurvivalCurve {
  readonly n: number;
  readonly censored: number;
  readonly points: readonly SurvivalPoint[];
  /** First crossing of 0.5, interpolated; `null` when the curve never gets there. */
  readonly medianH: number | null;
}

/** Result of the two-sample log-rank test (SPEC §6, DP-04). */
export interface LogRankResult {
  readonly chi2: number;
  readonly pValue: number;
  /** `pValue < alpha`; always `false` when the comparison is dishonest. */
  readonly established: boolean;
  readonly nA: number;
  readonly nB: number;
  readonly censoredA: number;
  readonly censoredB: number;
  readonly censoredShareA: number;
  readonly censoredShareB: number;
  /** Why the statistic was not computed (empty/event-less arm); `null` otherwise. */
  readonly reason: string | null;
}

const DEFAULT_ALPHA: number = 0.05;

/* -------------------------------------------------------------- chi-squared */

/** Series iterations for the incomplete gamma function. */
const ITMAX: number = 100;
/** Convergence tolerance of the incomplete gamma function. */
const EPS: number = 3e-7;
/** Smallest representable magnitude kept in the continued fraction. */
const FPMIN: number = 1e-300;
/** Numerical Recipes coefficients of the Lanczos log-gamma approximation. */
const GAMMA_COEF: readonly number[] = [
  76.18009172947146,
  -86.50532032941677,
  24.01409824083091,
  -1.231739572450155,
  1.208650973866179e-3,
  -5.395239384953e-6,
];

/** Natural logarithm of Γ(x) (Lanczos, with reflection below 0.5). */
function logGamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  let y = x;
  let ser = 1.000000000190015;
  for (let i = 0; i < GAMMA_COEF.length; i += 1) {
    y += 1;
    ser += GAMMA_COEF[i] / y;
  }
  const t = x + 5.5;
  return -t + (x + 0.5) * Math.log(t) + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularized lower incomplete gamma P(a, x), by series (Numerical Recipes). */
function gammaSeries(a: number, x: number): number {
  const gln = logGamma(a);
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let i = 1; i <= ITMAX; i += 1) {
    ap += 1;
    del = (del * x) / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

/** Regularized upper incomplete gamma Q(a, x), by continued fraction. */
function gammaContinuedFraction(a: number, x: number): number {
  const gln = logGamma(a);
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Regularized upper incomplete gamma Q(a, x). */
function regularizedGammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) return 1 - gammaSeries(a, x);
  return gammaContinuedFraction(a, x);
}

/**
 * Upper tail of the chi-squared distribution, implemented here with no
 * dependency: Q(df/2, x/2) through the regularized incomplete gamma function
 * (series + continued fraction). `df` defaults to 1, the log-rank case.
 */
export function chi2UpperTail(x: number, degreesOfFreedom: number = 1): number {
  if (!Number.isFinite(x)) return x > 0 ? 0 : 1;
  if (x <= 0 || degreesOfFreedom <= 0) return 1;
  return regularizedGammaQ(degreesOfFreedom / 2, x / 2);
}

/* ----------------------------------------------------------- Kaplan-Meier */

/** Number of observations that never closed (censored). */
function countCensored(observations: readonly SurvivalObservation[]): number {
  let n = 0;
  for (const o of observations) if (!o.event) n += 1;
  return n;
}

/** Share of still-open tickets in a cohort, in [0, 1]; makes 40 % sayable. */
export function censoredShare(observations: readonly SurvivalObservation[]): number {
  return share(countCensored(observations), observations.length);
}

/**
 * Median survival: first crossing of 0.5, linearly interpolated across the two
 * steps that straddle it. `null` when the curve never drops below 0.5 — the
 * honest answer, never an extrapolation (SPEC §20, DP-04).
 */
function survivalMedian(points: readonly SurvivalPoint[]): number | null {
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].survival < 0.5) {
      if (i === 0) return points[0].t;
      const before = points[i - 1];
      const after = points[i];
      return before.t
        + ((after.t - before.t) * (before.survival - 0.5))
          / (before.survival - after.survival);
    }
  }
  return null;
}

/**
 * Kaplan-Meier curve of the lead time (SPEC §6, DP-04).
 *
 * Ties are folded into one point: several events at the same instant produce a
 * single survival factor `(atRisk - events) / atRisk`. Censoring never drops
 * the curve, it only shrinks the risk set. An empty sample renders an empty
 * curve with `medianH: null`.
 */
export function kaplanMeier(observations: readonly SurvivalObservation[]): SurvivalCurve {
  const sorted = [...observations].sort((a, b) => a.durationH - b.durationH);
  const n = sorted.length;
  const censored = countCensored(sorted);
  if (n === 0) {
    return { n: 0, censored: 0, points: [], medianH: null };
  }
  const points: SurvivalPoint[] = [];
  let survival = 1;
  let atRisk = n;
  let index = 0;
  while (index < n) {
    const t = sorted[index].durationH;
    let events = 0;
    let censoredAtT = 0;
    while (index < n && sorted[index].durationH === t) {
      if (sorted[index].event) events += 1;
      else censoredAtT += 1;
      index += 1;
    }
    if (events > 0) {
      survival *= (atRisk - events) / atRisk;
      points.push({ t, atRisk, events, survival });
    }
    atRisk -= events + censoredAtT;
  }
  return { n, censored, points, medianH: survivalMedian(points) };
}

/* ----------------------------------------------------------------- log-rank */

/** Sorted, unique event times across both arms. */
function eventTimes(observations: readonly SurvivalObservation[]): number[] {
  const times = observations.filter((o) => o.event).map((o) => o.durationH);
  times.sort((a, b) => a - b);
  return Array.from(new Set(times));
}

/** Members still at risk at time `t`: those with a duration at least `t`. */
function countAtRisk(observations: readonly SurvivalObservation[], t: number): number {
  let n = 0;
  for (const o of observations) if (o.durationH >= t) n += 1;
  return n;
}

/** Events exactly at time `t`. */
function countEvents(observations: readonly SurvivalObservation[], t: number): number {
  let n = 0;
  for (const o of observations) if (o.event && o.durationH === t) n += 1;
  return n;
}

/** Hypergeometric variance of the event count in arm A at one event time. */
function hypergeometricVariance(
  events: number,
  atRisk: number,
  atRiskA: number,
): number {
  const atRiskB = atRisk - atRiskA;
  return (events * (atRisk - events) * atRiskA * atRiskB) / (atRisk * atRisk * (atRisk - 1));
}

/** The honest result when the comparison cannot be run (empty or event-less arm). */
function inconclusive(
  nA: number,
  nB: number,
  censoredA: number,
  censoredB: number,
  reason: string,
): LogRankResult {
  return {
    chi2: 0,
    pValue: 1,
    established: false,
    nA,
    nB,
    censoredA,
    censoredB,
    censoredShareA: share(censoredA, nA),
    censoredShareB: share(censoredB, nB),
    reason,
  };
}

/**
 * Two-sample log-rank test of the lead-time survival (SPEC §6, DP-04), with the
 * hypergeometric variance and the chi-squared upper tail at one degree of
 * freedom. `alpha` defaults to 0.05. An empty or event-less arm renders an
 * honest `established: false` with a `reason`, never an exception nor a NaN.
 */
export function logRank(
  a: readonly SurvivalObservation[],
  b: readonly SurvivalObservation[],
  alpha: number = DEFAULT_ALPHA,
): LogRankResult {
  const nA = a.length;
  const nB = b.length;
  const censoredA = countCensored(a);
  const censoredB = countCensored(b);
  if (nA === 0 || nB === 0) {
    return inconclusive(nA, nB, censoredA, censoredB, 'one arm has no observations');
  }
  const times = eventTimes([...a, ...b]);
  if (times.length === 0) {
    return inconclusive(nA, nB, censoredA, censoredB, 'no events to compare');
  }
  let observed = 0;
  let expected = 0;
  let variance = 0;
  for (const t of times) {
    const atRiskA = countAtRisk(a, t);
    const atRiskB = countAtRisk(b, t);
    const eventsA = countEvents(a, t);
    const eventsB = countEvents(b, t);
    const events = eventsA + eventsB;
    const atRisk = atRiskA + atRiskB;
    observed += eventsA;
    expected += (events * atRiskA) / atRisk;
    if (atRisk > 1) {
      variance += hypergeometricVariance(events, atRisk, atRiskA);
    }
  }
  if (variance <= 0) {
    return inconclusive(nA, nB, censoredA, censoredB, 'no variance at the event times');
  }
  const chi2 = ((observed - expected) ** 2) / variance;
  const pValue = chi2UpperTail(chi2, 1);
  return {
    chi2,
    pValue,
    established: pValue < alpha,
    nA,
    nB,
    censoredA,
    censoredB,
    censoredShareA: share(censoredA, nA),
    censoredShareB: share(censoredB, nB),
    reason: null,
  };
}