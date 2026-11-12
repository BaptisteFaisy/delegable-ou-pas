/**
 * Shared projections of the screens (SPEC §16, §20; DP-11, DP-17, DP-20,
 * recipe 10).
 *
 * This module holds the ONE way a rate is rendered: the rate, its sample size
 * and its interval, always together (recipe 10). No screen formats a number by
 * itself; every screen calls these helpers.
 *
 * Pure module: no `@forge/*` import, no clock, no randomness. A viewmodel is a
 * projection of what the domain produced: it never recomputes a rate, a median
 * or an interval, it formats them (SPEC §20, docs/CONTRACTS.md §L8).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type {
  Arm,
  CohortKey,
  CohortLevel,
  Conclusion,
  DurationStat,
  Level,
  ProportionStat,
  Source,
} from '../types.js';
import type {
  Confidence,
  Guardrail,
  MapColor,
  Recommendation,
} from '../types-advice.js';
import { MAP_COLOR_OF } from '../types-advice.js';
import { percent, percentCeil, percentFloor } from '../domain/stats.js';
import { gapEstablished } from '../domain/conclusion.js';
import type { Translate } from '../i18n/index.js';

/** A rate as a screen shows it: the three parts of recipe 10, never split. */
export interface RateLine {
  /** The rate alone, e.g. "83 %" (SPEC §7 rule 3). */
  readonly rate: string;
  /** The sample size behind the rate (SPEC §7 rule 2). */
  readonly n: number;
  /** The sample size as text, e.g. "n = 41". */
  readonly sample: string;
  /** The 95 % interval as text, e.g. "[69 % ; 91 %]". */
  readonly interval: string;
  /** The whole line, the only text a screen may render for a rate. */
  readonly text: string;
}

/**
 * The one rate renderer of the app (recipe 10): a rate is never projected
 * without its sample size and its interval. `null` stays `null`: an absent arm
 * is normal data, never a zero (SPEC §20).
 */
export function rateLine(stat: ProportionStat | null, t: Translate): RateLine | null {
  if (stat === null) return null;
  const rate = percent(stat.rate);
  // Conservative bounds: the displayed interval never claims more than the
  // computed one (SPEC §8 card: 18/26 reads "[50 % ; 84 %]").
  const low = percentFloor(stat.ciLow);
  const high = percentCeil(stat.ciHigh);
  return {
    rate,
    n: stat.n,
    sample: t('stats.sample', { n: stat.n }),
    interval: t('stats.interval', { low, high }),
    text: t('stats.rate', { rate, n: stat.n, low, high }),
  };
}

/** The text of a rate, or the explicit "no ticket" when the arm is empty. */
export function rateText(stat: ProportionStat | null, t: Translate): string {
  const line = rateLine(stat, t);
  return line === null ? t('stats.none') : line.text;
}

/** A median delay as text, with its sample size: a duration is never alone. */
export function medianText(stat: DurationStat | null, t: Translate): string {
  if (stat === null) return t('stats.none');
  return t('stats.median', { hours: stat.medianH, n: stat.n });
}

/** The label of one of the four recommendations (SPEC §8). */
export function recommendationLabel(value: Recommendation, t: Translate): string {
  return t(`recommendation.${value}`);
}

/** The label of one of the four conclusions, "we don't know" included (SPEC §7 rule 4). */
export function conclusionLabel(value: Conclusion, t: Translate): string {
  return t(`conclusion.${value}`);
}

/** "Established gap" or "gap not established", from the domain verdict (SPEC §7 rule 4). */
export function gapLabel(conclusion: Conclusion, t: Translate): string {
  return gapEstablished(conclusion) ? t('gap.established') : t('gap.not-established');
}

/** The label of one confidence level (SPEC §8). */
export function confidenceLabel(value: Confidence, t: Translate): string {
  return t(`confidence.${value}`);
}

/** The label of one guardrail that fired (SPEC §8, DP-12). */
export function guardrailLabel(value: Guardrail, t: Translate): string {
  return t(`guardrail.${value}`);
}

/** The label of one arm of a cohort (SPEC §4 "Bras"). */
export function armLabel(arm: Arm, t: Translate): string {
  return arm === 'agent' ? t('ui.arm.agent') : t('ui.arm.human');
}

/** The label of one involvement level (SPEC §5). */
export function levelLabel(level: Level, t: Translate): string {
  return t(`action.level.${level}`);
}

/** The label of one source of involvement, always shown with it (DP-01). */
export function sourceLabel(source: Source, t: Translate): string {
  return t(`action.source.${source}`);
}

/** The colour a recommendation paints on the matrix (SPEC §12). */
export function colorOf(value: Recommendation): MapColor {
  return MAP_COLOR_OF[value];
}

/** The label of a cohort level, so a widening is readable (SPEC §7 rule 1). */
export function cohortLevelLabel(level: CohortLevel, t: Translate): string {
  return t(`cohort.level.${level}`);
}

/**
 * The cohort as one line: nature · zone · size (SPEC §8 "Cohorte"). A field the
 * level ignores is written "-", never invented.
 */
export function cohortLine(key: CohortKey, t: Translate): string {
  return t('card.cohort', {
    nature: key.nature,
    zone: key.zone ?? '-',
    size: key.size ?? '-',
  });
}

/** The cohort level as one line, so a fallback is visible (SPEC §7 rule 1). */
export function cohortLevelLine(key: CohortKey, t: Translate): string {
  return t('card.cohort-level', { level: cohortLevelLabel(key.level, t) });
}

/**
 * The widening announced out loud: a cohort broader than "nature × zone × size"
 * means the app went up one level and says so (SPEC §7 rule 1, recipe 1).
 * `null` when the cohort is the narrowest one.
 */
export function widenedNotice(key: CohortKey, t: Translate): string | null {
  if (key.level === 'nature-zone-size') return null;
  return t('cohort.widened', { level: cohortLevelLabel(key.level, t) });
}

/**
 * The permanent demo banner (DP-20): a project running on the demonstration
 * dataset says so on every screen. `null` when the data is real.
 */
export interface DemoNotice {
  readonly title: string;
  readonly text: string;
}

/** The demo banner of one screen, or `null` when the data is real (DP-20). */
export function demoNotice(demo: boolean, t: Translate): DemoNotice | null {
  if (!demo) return null;
  return { title: t('ui.demo-banner.title'), text: t('ui.demo-banner.text') };
}

/** The sentence that replaces every figure of a masked cohort (DP-17, recipe 11). */
export function maskedNotice(t: Translate): string {
  return t('cohort.masked');
}
