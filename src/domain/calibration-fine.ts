/**
 * Fine calibration — the "Can this app be trusted?" screen (SPEC §10) becomes a
 * statistic instead of three global rates (DP-21).
 *
 * Why this module exists: `calibration.ts` answers with three rates. Believing
 * an app is a measured question, so this module renders the two bounded losses
 * of a probability forecast (Brier, log-loss), a reliability curve whose empty
 * bins stay empty, calibration per cohort **and per policy version**, the
 * discrimination (AUC) of the forecast, and the verdict of SPEC §10.
 *
 * Two rules shape everything below:
 * - no rate leaves this module without its sample size and its interval: every
 *   proportion goes through `proportion()` of `stats.ts` (SPEC §7 rule 3,
 *   recipe 10);
 * - "we do not know" is a value like the others: too little hindsight renders
 *   `informative: false`, and the SPEC §10 rule renders `widenUnknown: true` so
 *   the app widens "not enough data" instead of pretending (SPEC §20).
 *
 * A calibration only means something per version of the recommendation rule:
 * mixing two policy versions in one computation is an error, not a rounding, so
 * `calibrationByPolicyVersion` always renders the figures separated by version
 * and `policyVersionReport` says out loud when several versions were mixed.
 *
 * Anonymity (DP-17): nothing here identifies a person. A record carries an
 * `issueId` and a `cohortKey`, that is all, and no output adds a name, an
 * account or an address.
 *
 * The domain is pure: no `@forge/*`, no clock, no randomness, no I/O.
 * Rule: files < 500 lines, functions < 50 lines.
 */

import type { ProportionStat } from '../types.js';
import type { Recommendation } from '../types-advice.js';
import { percent, proportion } from './stats.js';

/**
 * One measured row of the calibration (SPEC §10, SPEC §18 table `calibration`).
 *
 * A statistics row: no person identifier lives here, only a ticket identifier
 * and the cohort key the advice came from (DP-17).
 */
export interface CalibrationRecord {
  /** Ticket the advice was given on; identifies a ticket, never a person (DP-17). */
  readonly issueId: string;
  /** What the app recommended at the time (SPEC §8). */
  readonly recommendation: Recommendation;
  /** Probability of a clean closure the app announced, in [0, 1] (SPEC §10). */
  readonly predictedProbability: number;
  /** What was observed afterwards: the ticket closed clean or not (SPEC §6). */
  readonly cleanClose: boolean;
  /** Cohort the advice came from; carries no person identifier (DP-17). */
  readonly cohortKey: string;
  /** Version of the recommendation rule that produced the advice (SPEC §10). */
  readonly policyVersion: string;
}

/**
 * Clipping epsilon of the log-loss: `log(0)` is `-Infinity`, and an infinite
 * loss would swallow every other ticket (SPEC §20: missing or extreme data is
 * normal, never an exception). A forecast is clipped to `[eps, 1 - eps]`.
 */
export const LOG_LOSS_EPSILON = 1e-15;

/** Ceiling of `logLoss`: the loss of a forecast of 0 on a ticket that closed clean. */
export const LOG_LOSS_CEILING = -Math.log(LOG_LOSS_EPSILON);

/** Default number of bins of the reliability curve (SPEC §10). */
export const DEFAULT_BINS = 10;

/** Default sample size a bucket must reach to be informative (SPEC §7 rule 2). */
export const DEFAULT_MIN_PER_BUCKET = 20;

/** AUC of a forecast that ranks nothing: the honest value when one class is missing. */
export const NEUTRAL_AUC = 0.5;

/**
 * Said out loud whenever the AUC is neutral: a single outcome observed
 * everywhere (every ticket closed clean, or none) means the forecast cannot be
 * ranked, and the screen must say so instead of showing a bare 0.5 (SPEC §10).
 */
export const NEUTRAL_AUC_NOTE =
  'AUC à 0,5 : le pronostic ne classe rien, une seule issue a été observée partout.';

/** The recommendations that hand the ticket over to an agent (SPEC §8, §10). */
const ENTRUSTED: readonly Recommendation[] = ['delegate', 'delegate-with-review'];

/** The recommendation that keeps the ticket for a human (SPEC §8, §10). */
const KEPT: Recommendation = 'keep-human';

/** Keeps a probability inside [0, 1]; an out-of-range forecast is clipped, not thrown. */
function clampProbability(value: number): number {
  if (value < 0) return 0;
  return value > 1 ? 1 : value;
}

/**
 * Records whose forecast is usable. A missing probability (`NaN`, `Infinity`)
 * leaves the computation instead of poisoning it, and the sample size rendered
 * beside every figure says how much was left out (SPEC §20).
 */
function forecastable(records: readonly CalibrationRecord[]): readonly CalibrationRecord[] {
  return records.filter((record) => Number.isFinite(record.predictedProbability));
}

/** Clean closures of a group, with sample size and interval: the only rendering allowed. */
function observedRate(records: readonly CalibrationRecord[]): ProportionStat {
  return proportion(
    records.filter((record) => record.cleanClose).length,
    records.length,
  );
}

/**
 * Brier score of the forecasts: the mean squared error, in [0, 1] (SPEC §10).
 *
 * `0` = every prediction was exactly right (1 for a clean closure, 0 otherwise);
 * `0.25` = the app always said "one chance out of two"; `1` = always exactly
 * wrong. Nothing usable to score renders `0` and the sample size carried beside
 * it says nothing was measured (SPEC §20) — a lower Brier is a better forecast.
 */
export function brierScore(records: readonly CalibrationRecord[]): number {
  const usable = forecastable(records);
  if (usable.length === 0) return 0;
  let sum = 0;
  for (const record of usable) {
    const error = clampProbability(record.predictedProbability) - (record.cleanClose ? 1 : 0);
    sum += error * error;
  }
  return sum / usable.length;
}

/**
 * Logarithmic loss of the forecasts, in `[0, LOG_LOSS_CEILING]` (SPEC §10).
 *
 * The forecast is clipped to `[LOG_LOSS_EPSILON, 1 - LOG_LOSS_EPSILON]`, so a
 * confident forecast that turns out wrong costs a lot — about 34.5 with the
 * default epsilon — but never `Infinity`. A perfect forecast renders about `0`
 * (1e-15 with the default epsilon, the price of the clip), `ln(2)` ≈ 0.693 =
 * "one chance out of two" everywhere. Nothing usable to score renders `0`.
 */
export function logLoss(records: readonly CalibrationRecord[]): number {
  const usable = forecastable(records);
  if (usable.length === 0) return 0;
  let sum = 0;
  for (const record of usable) {
    const clipped = clampProbability(record.predictedProbability);
    const forecast = Math.min(Math.max(clipped, LOG_LOSS_EPSILON), 1 - LOG_LOSS_EPSILON);
    sum += record.cleanClose ? -Math.log(forecast) : -Math.log(1 - forecast);
  }
  return sum / usable.length;
}

/**
 * One bin of the reliability curve: the tickets whose forecast fell in
 * `[predictedLow, predictedHigh)` and what actually closed clean (SPEC §10).
 *
 * An empty bin renders `n = 0` and the widest interval (`proportion(0, 0)`):
 * a hole is information about where the app never spoke, never a value to
 * interpolate (SPEC §20).
 */
export interface ReliabilityBin {
  /** Index of the bin, from 0 (lowest forecasts) up. */
  readonly bin: number;
  /** Lower bound of the bin, inclusive, in [0, 1]. */
  readonly predictedLow: number;
  /** Upper bound of the bin, exclusive except for the last one, in [0, 1]. */
  readonly predictedHigh: number;
  /** Number of tickets in the bin; 0 when the app never forecasted there. */
  readonly n: number;
  /** Observed clean closures, with sample size and interval (SPEC §7 rule 3). */
  readonly observed: ProportionStat;
}

/** Index of the bin a forecast falls in; a forecast of 1 lands in the last bin. */
function binIndexOf(probability: number, width: number): number {
  const index = Math.floor(clampProbability(probability) * width);
  return index >= width ? width - 1 : index;
}

/**
 * Reliability curve of the forecasts (SPEC §10): one bin per slice of forecast
 * probability, each bin rendering its sample size and the observed clean
 * closure with its Wilson interval.
 *
 * A well calibrated app has `observed.rate` near the middle of each bin. Empty
 * bins are rendered as they are — `n = 0`, no interpolation — because a range
 * the app never spoke about is part of the answer (SPEC §20).
 */
export function reliabilityCurve(
  records: readonly CalibrationRecord[],
  bins: number = DEFAULT_BINS,
): readonly ReliabilityBin[] {
  const width = Math.max(1, Math.trunc(bins));
  const buckets: CalibrationRecord[][] = Array.from({ length: width }, () => []);
  for (const record of forecastable(records)) {
    buckets[binIndexOf(record.predictedProbability, width)].push(record);
  }
  return buckets.map((bucket, index) => ({
    bin: index,
    predictedLow: index / width,
    predictedHigh: (index + 1) / width,
    n: bucket.length,
    observed: observedRate(bucket),
  }));
}

/**
 * Calibration of one group — a cohort or a policy version (SPEC §10).
 *
 * `informative: false` below the threshold is an answer, not a failure: not
 * enough hindsight to say anything (SPEC §7 rule 2, SPEC §20).
 */
export interface CohortCalibration {
  /** The cohort key, or the policy version when the rows come from `calibrationByPolicyVersion`. */
  readonly cohortKey: string;
  /** Number of tickets behind the figures (SPEC §7 rule 2). */
  readonly n: number;
  /** Brier score of the group, in [0, 1]; lower is better (SPEC §10). */
  readonly brier: number;
  /** Observed clean closures, with sample size and interval (SPEC §7 rule 3). */
  readonly observed: ProportionStat;
  /** False when the group is under the threshold: not enough hindsight (SPEC §20). */
  readonly informative: boolean;
}

/** One key and the records that carry it. */
type KeyedGroup = readonly [string, readonly CalibrationRecord[]];

/** Groups the records by a key, ordered by key so the rendering is deterministic. */
function groupByKey(
  records: readonly CalibrationRecord[],
  keyOf: (record: CalibrationRecord) => string,
): readonly KeyedGroup[] {
  const groups = new Map<string, CalibrationRecord[]>();
  for (const record of records) {
    const key = keyOf(record);
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [record]);
    else bucket.push(record);
  }
  return [...groups.entries()].sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
}

/** Calibrates every group of a partition, one row per group (SPEC §10). */
function calibrateGroups(
  records: readonly CalibrationRecord[],
  keyOf: (record: CalibrationRecord) => string,
  min: number,
): readonly CohortCalibration[] {
  return groupByKey(records, keyOf).map(([key, group]: KeyedGroup) => ({
    cohortKey: key,
    n: group.length,
    brier: brierScore(group),
    observed: observedRate(group),
    informative: group.length >= min,
  }));
}

/**
 * Calibration per cohort (SPEC §10): Brier score and observed clean closure of
 * every cohort, each with its sample size. Under `minPerCohort` tickets the row
 * says `informative: false` — not enough hindsight is a answer, and the row is
 * still rendered with its figures, never hidden (SPEC §20).
 */
export function calibrationByCohort(
  records: readonly CalibrationRecord[],
  minPerCohort: number = DEFAULT_MIN_PER_BUCKET,
): readonly CohortCalibration[] {
  return calibrateGroups(records, (record) => record.cohortKey, minPerCohort);
}

/**
 * The per-version calibration and the signal that several versions were mixed.
 *
 * `mixed` is the error flag of SPEC §10: a calibration only means something for
 * one version of the recommendation rule, so the rows are always separated by
 * version and `warning` says so in plain words.
 */
export interface PolicyVersionReport {
  /** One row per policy version, in version order (SPEC §10). */
  readonly rows: readonly CohortCalibration[];
  /** The policy versions found in the records. */
  readonly versions: readonly string[];
  /** True when the records carry more than one version: do not add the rows up. */
  readonly mixed: boolean;
  /** Plain-language warning; empty when a single version was measured. */
  readonly warning: string;
}

/**
 * Calibration per policy version, with the warning that mixing versions is an
 * error (SPEC §10). Use this when the screen has to say why the rows are split.
 */
export function policyVersionReport(records: readonly CalibrationRecord[]): PolicyVersionReport {
  const rows = calibrateGroups(records, (record) => record.policyVersion, DEFAULT_MIN_PER_BUCKET);
  const versions = rows.map((row) => row.cohortKey);
  const mixed = versions.length > 1;
  return {
    rows,
    versions,
    mixed,
    warning: mixed
      ? `Plusieurs versions de politique mélangées (${versions.join(', ')}) : les chiffres sont rendus séparés par version, une calibration n'a de sens que par version de règle.`
      : '',
  };
}

/**
 * Calibration per policy version (SPEC §10): same shape as `calibrationByCohort`,
 * the key being the version. The rows are **never** pooled across versions —
 * mixing two rule versions in one Brier would compare two different apps.
 * Call `policyVersionReport` to get the warning that goes with a mixed input.
 */
export function calibrationByPolicyVersion(
  records: readonly CalibrationRecord[],
): readonly CohortCalibration[] {
  return policyVersionReport(records).rows;
}

/** Sum of the ranks of the positives, ties sharing the average rank (Mann-Whitney). */
function positiveRankSum(sorted: readonly CalibrationRecord[]): number {
  let sum = 0;
  let index = 0;
  while (index < sorted.length) {
    let last = index;
    while (
      last + 1 < sorted.length &&
      sorted[last + 1].predictedProbability === sorted[index].predictedProbability
    ) {
      last += 1;
    }
    const averageRank = (index + last) / 2 + 1;
    for (let cursor = index; cursor <= last; cursor += 1) {
      if (sorted[cursor].cleanClose) sum += averageRank;
    }
    index = last + 1;
  }
  return sum;
}

/**
 * Discrimination of the forecast: the AUC computed by the Mann-Whitney
 * statistic (SPEC §10). `1` = every clean closure was forecast higher than
 * every dirty one; `0.5` = the forecast ranks nothing.
 *
 * Ties count 0.5, which is exactly what the average rank gives them. When one
 * class is missing — every ticket closed clean, or none did — there is nothing
 * to rank and the honest value is `NEUTRAL_AUC` (0.5), never 0 and never 1.
 */
export function discrimination(records: readonly CalibrationRecord[]): number {
  const usable = forecastable(records);
  const positives = usable.filter((record) => record.cleanClose).length;
  const negatives = usable.length - positives;
  if (positives === 0 || negatives === 0) return NEUTRAL_AUC;
  const sorted = [...usable].sort((left, right) => left.predictedProbability - right.predictedProbability);
  const u = positiveRankSum(sorted) - (positives * (positives + 1)) / 2;
  return u / (positives * negatives);
}

/**
 * The answer of the "Can this app be trusted?" screen (SPEC §10, DP-21).
 *
 * `widenUnknown: true` is a mechanism, not a comment: when "hand it over" does
 * not do clearly better than "keep it human", the app cannot claim to know, so
 * it widens "not enough data" on the tickets it scores (SPEC §7 rule 4).
 */
export interface CalibrationVerdict {
  /** False when the calibration cannot be trusted: too few tickets, or no visible gain. */
  readonly informative: boolean;
  /** Why, in plain words, with the figures inside (SPEC §8 "Ce que voit le développeur"). */
  readonly reason: string;
  /** True when the app must widen "not enough data" instead of concluding (SPEC §10). */
  readonly widenUnknown: boolean;
  /** Brier score of all the records, in [0, 1]; lower is better (SPEC §10). */
  readonly brier: number;
  /** Discrimination of the forecast, in [0, 1]; 0.5 ranks nothing (SPEC §10). */
  readonly auc: number;
}

/** Readable reason when there is nothing to compare at all (SPEC §20). */
function reasonNothingMeasured(): string {
  return 'Aucun ticket « à confier » ni « à garder » à comparer : rien à mesurer, l’app ne peut pas se noter.';
}

/** Readable reason when a bucket is under the threshold (SPEC §7 rule 2). */
function reasonTooThin(entrusted: number, kept: number, min: number): string {
  return `Pas assez de recul pour noter l’app : ${entrusted} tickets « à confier » et ${kept} « à garder », sous le seuil de ${min} par seau.`;
}

/** Readable reason when the gain of "hand it over" is established (SPEC §10). */
function reasonEstablished(entrusted: ProportionStat, kept: ProportionStat): string {
  return `« À confier » ferme proprement plus souvent que « à garder » : ${percent(entrusted.rate)} contre ${percent(kept.rate)} (intervalles disjoints, n = ${entrusted.n} et ${kept.n}).`;
}

/** Readable reason when the gain is not visible: the app widens the unknown (SPEC §10). */
function reasonNotClear(entrusted: ProportionStat, kept: ProportionStat): string {
  return `« À confier » ne fait pas nettement mieux que « à garder » : ${percent(entrusted.rate)} contre ${percent(kept.rate)}, intervalles qui se recouvrent — l’app élargit « pas assez de recul ».`;
}

/** The two buckets the SPEC §10 rule compares. */
interface AdviceBuckets {
  /** Tickets the app said to hand over (`delegate`, `delegate-with-review`). */
  readonly entrusted: readonly CalibrationRecord[];
  /** Tickets the app said to keep for a human (`keep-human`). */
  readonly kept: readonly CalibrationRecord[];
}

/** Splits the records into the two buckets of the rule; grey advice counts in neither. */
function splitByAdvice(records: readonly CalibrationRecord[]): AdviceBuckets {
  return {
    entrusted: records.filter((record) => ENTRUSTED.includes(record.recommendation)),
    kept: records.filter((record) => record.recommendation === KEPT),
  };
}

/** What the rule decided, before the AUC note is appended to the reason. */
interface BucketJudgement {
  readonly informative: boolean;
  readonly reason: string;
}

/**
 * Applies the SPEC §10 rule: "hand it over" must close clearly cleaner than
 * "keep it human". "Clearly" means the Wilson intervals do not overlap — a
 * deliberately conservative reading, because this module must not import the
 * difference test of lot A1 (it is still being merged).
 */
function judgeBuckets(buckets: AdviceBuckets, min: number): BucketJudgement {
  const { entrusted, kept } = buckets;
  if (entrusted.length === 0 && kept.length === 0) {
    return { informative: false, reason: reasonNothingMeasured() };
  }
  if (entrusted.length < min || kept.length < min) {
    return { informative: false, reason: reasonTooThin(entrusted.length, kept.length, min) };
  }
  const entrustedObserved = observedRate(entrusted);
  const keptObserved = observedRate(kept);
  if (entrustedObserved.ciLow > keptObserved.ciHigh) {
    return { informative: true, reason: reasonEstablished(entrustedObserved, keptObserved) };
  }
  return { informative: false, reason: reasonNotClear(entrustedObserved, keptObserved) };
}

/** Appends the neutral-AUC note when the forecast ranks nothing (SPEC §10). */
function withAucNote(reason: string, auc: number): string {
  return auc === NEUTRAL_AUC ? `${reason} ${NEUTRAL_AUC_NOTE}` : reason;
}

/**
 * Verdict of the "Can this app be trusted?" screen (SPEC §10, DP-21), computed
 * on one policy version at a time: feed it the records of a single version, never
 * a mixture (see `policyVersionReport`).
 *
 * `widenUnknown` is the mirror of `informative` and it is a **mechanism**, not a
 * comment: when the verdict is not informative — too few tickets, or no visible
 * gain of "hand it over" — the app widens "not enough data" on the tickets it
 * scores instead of pretending to know (SPEC §7 rule 4, SPEC §20).
 */
export function calibrationVerdict(
  records: readonly CalibrationRecord[],
  options?: { minPerBucket?: number },
): CalibrationVerdict {
  const min = Math.max(1, Math.trunc(options?.minPerBucket ?? DEFAULT_MIN_PER_BUCKET));
  const brier = brierScore(records);
  const auc = discrimination(records);
  const judgement = judgeBuckets(splitByAdvice(records), min);
  return {
    informative: judgement.informative,
    reason: withAucNote(judgement.reason, auc),
    widenUnknown: !judgement.informative,
    brier,
    auc,
  };
}
