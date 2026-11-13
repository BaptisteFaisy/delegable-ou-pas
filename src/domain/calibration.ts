/**
 * Calibration (SPEC §10 "La calibration", DP-21).
 *
 * "Peut-on croire cette app ?" — one row per recommendation given, with the
 * clean closure observed afterwards, always with its sample size and its
 * interval (SPEC §7 rule 3, recipe 10). When "hand it to an agent" does not
 * clearly beat "keep it for a human", the screen shows a header warning and
 * the app widens `not-enough-data`: that widening is what `adviceAddsNothing`
 * expresses (SPEC §10).
 *
 * No person identifier lives here (SPEC §18, last line). Pure module.
 */
import type { ProportionStat } from '../types.js';
import type { Calibration, Recommendation } from '../types-advice.js';
import { wilsonInterval } from './stats.js';
import { intervalsOverlap } from './conclusion.js';

/** One recommendation of the "hand it to an agent" family (SPEC §10). */
function isDelegate(value: Recommendation): boolean {
  return value === 'delegate' || value === 'delegate-with-review';
}

/** Aggregates several rows into one proportion, keepinh its sample size. */
function combine(rows: readonly Calibration[]): ProportionStat {
  let successes = 0;
  let n = 0;
  for (const row of rows) {
    n += row.clean.n;
    successes += Math.round(row.clean.rate * row.clean.n);
  }
  return wilsonInterval(successes, n);
}

/**
 * One row of the calibration table (SPEC §10, §18 table `calibration`): a
 * recommendation given and the clean closure observed afterwards, rendered as
 * a proportion with its interval, never a bare rate (SPEC §7 rule 3).
 */
export function calibrate(
  projectId: string,
  epochId: string,
  value: Recommendation,
  cleanCount: number,
  n: number,
): Calibration {
  return { projectId, epochId, value, clean: wilsonInterval(cleanCount, n) };
}

/**
 * True when the advice brings nothing measurable on this project: "hand it to
 * an agent" does not clearly beat "keep it for a human" because their clean
 * closures intervals overlap, or one side has no data yet (SPEC §10).
 */
export function adviceAddsNothing(rows: readonly Calibration[]): boolean {
  const delegate = combine(rows.filter((row) => isDelegate(row.value)));
  const keep = combine(rows.filter((row) => row.value === 'keep-human'));
  if (delegate.n === 0 || keep.n === 0) return true;
  return intervalsOverlap(delegate, keep);
}

/**
 * How far ahead "hand it to an agent" is over "keep it for a human", in
 * [−1, 1]: positive means the agent advice closes cleaner on this project
 * (SPEC §10). The screen reads it to size the warning.
 */
export function confidenceGap(delegate: ProportionStat, keep: ProportionStat): number {
  return delegate.rate - keep.rate;
}