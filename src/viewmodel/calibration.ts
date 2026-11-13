/**
 * The calibration screen as a projection (SPEC §10 "La calibration", §16.7;
 * DP-21, recipe 10).
 *
 * One row per recommendation: the clean closure observed afterwards, always with
 * its sample size and its interval (recipe 10). When the advice brings nothing
 * measurable — "hand it to an agent" does not clearly beat "keep it for a
 * human" — the screen says so up front (SPEC §10, DP-21).
 *
 * "We do not know" keeps the same dignity as the three other rows: it is a row
 * like the others, not a greyed-out absence (SPEC §7 rule 4).
 *
 * Pure module: no `@forge/*`, no clock. The verdict `adviceAddsNothing` is
 * computed by the domain (src/domain/calibration.ts) and passed in: this module
 * never recomputes it.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Calibration } from '../types-advice.js';
import type { Recommendation } from '../types-advice.js';
import { RECOMMENDATIONS } from '../types-advice.js';
import type { Translate } from '../i18n/index.js';
import type { RateLine } from './common.js';
import { rateLine, recommendationLabel } from './common.js';

/** One row of the calibration: a recommendation and what happened afterwards. */
export interface CalibrationRowView {
  readonly recommendation: Recommendation;
  readonly label: string;
  /** Clean closure observed, with n and interval, or `null` when no ticket (recipe 10). */
  readonly clean: RateLine | null;
  readonly line: string;
}

/** The calibration screen (SPEC §16.7). */
export interface CalibrationView {
  readonly title: string;
  readonly intro: string;
  readonly rows: readonly CalibrationRowView[];
  /** The warning of the head of the page, or `null` when the advice does add something. */
  readonly warning: string | null;
  readonly anonymityNotice: string;
}

/** One row: the recommendation and its observed clean closure (SPEC §10). */
function rowView(
  recommendation: Recommendation,
  rows: readonly Calibration[],
  t: Translate,
): CalibrationRowView {
  const match = rows.find((row) => row.value === recommendation);
  const clean = match === undefined ? null : rateLine(match.clean, t);
  return {
    recommendation,
    label: recommendationLabel(recommendation, t),
    clean,
    line: clean === null ? t('ui.calibration.no-row') : clean.text,
  };
}

/**
 * Projects the calibration. A recommendation with no ticket yet renders its
 * explicit "no ticket" line, never a zero (SPEC §20).
 */
export function calibrationView(
  rows: readonly Calibration[],
  adviceAddsNothing: boolean,
  t: Translate,
): CalibrationView {
  return {
    title: t('ui.screen.calibration'),
    intro: rows.length === 0 ? t('docs.calibration-empty') : t('docs.calibration-intro'),
    rows: RECOMMENDATIONS.map((recommendation) => rowView(recommendation, rows, t)),
    warning: adviceAddsNothing ? t('docs.calibration-warning') : null,
    anonymityNotice: t('ui.anonymity'),
  };
}
