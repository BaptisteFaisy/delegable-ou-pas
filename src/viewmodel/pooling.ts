/**
 * The pooling screen as a projection (feature E3; SPEC §7 rule 2, §7 rule 3,
 * §12, §16, §20; DP-08, DP-09, DP-17).
 *
 * The screen says in plain words what the domain did: "cohort of 12 tickets:
 * [19 % ; 69 %] on its own, [11 % ; 85 %] once aggregated with the 9 cohorts
 * of the same nature — less assertive, but more informative", with the share of
 * the borrowed strength next to it.
 *
 * The rates are rendered by the ONE renderer of the app (`rateLine` of
 * `./common.js`): a rate never appears without its sample size and its
 * interval (recipe 10). This module computes no figure of its own: the
 * pooling is the domain's work (`poolCohorts` of `../domain/pooling.js`), this
 * module formats what it produced.
 *
 * The sentences specific to this feature are bilingual (`{ fr, en }`): their
 * catalogue keys do not exist yet (CONTRACT-NEEDED at integration time), while
 * the rates follow the language of the `Translate` the screen hands over.
 *
 * Pure module: no `@forge/*`, no clock, no randomness.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { ProportionStat } from '../types.js';
import type { PooledEstimate, PoolingInput } from '../domain/pooling.js';
import { poolCohorts } from '../domain/pooling.js';
import { percent } from '../domain/stats.js';
import type { Translate } from '../i18n/index.js';
import type { RateLine } from './common.js';
import { rateLine } from './common.js';

/** The title of the screen, in both languages (SPEC §16). */
const TITLE: { readonly fr: string; readonly en: string } = {
  fr: 'Le pooling des cohortes de même nature',
  en: 'The pooling of cohorts of the same nature',
};

/** What the screen says when there is no cohort to pool (SPEC §20). */
const EMPTY_NOTICE: { readonly fr: string; readonly en: string } = {
  fr: "Aucune cohorte à agréger : rien n'est emprunté, chaque cohorte se suffit à elle-même.",
  en: 'No cohort to aggregate: nothing is borrowed, each cohort is enough on its own.',
};

/** One cohort of the screen: what it says alone, and what it says pooled. */
export interface PoolingRowView {
  /** The key of the cohort (nature × zone × size). */
  readonly cohortKey: string;
  /** What the cohort measured alone, with its sample size and its interval. */
  readonly own: RateLine;
  /** What it measures once pooled with its siblings of the same nature. */
  readonly pooled: RateLine;
  /** How many cohorts of the same nature were aggregated. */
  readonly siblings: number;
  /** The share of the borrowed strength, between 0 and 1. */
  readonly borrowedShare: number;
  /** The share of the borrowed strength, as a percentage. */
  readonly borrowedShareText: string;
  /** True when the own rate has been pulled toward the prior (the shrinkage). */
  readonly shrunk: boolean;
  /** The sentence of the row, in both languages. */
  readonly headline: { readonly fr: string; readonly en: string };
  /** What the domain says about the borrowing, in both languages. */
  readonly note: { readonly fr: string; readonly en: string };
}

/** The pooling screen (SPEC §12). */
export interface PoolingView {
  /** The title of the screen, in both languages. */
  readonly title: { readonly fr: string; readonly en: string };
  /** One row per cohort, in the order of the inputs. */
  readonly rows: readonly PoolingRowView[];
  /** The explicit "nothing to pool" line, or `null` when there is something. */
  readonly emptyNotice: { readonly fr: string; readonly en: string } | null;
}

/**
 * The rate of a row: the ONE renderer of the app (recipe 10). A proportion
 * that comes from the domain is never null, so the fallback is unreachable —
 * it exists only to keep the types honest.
 */
function rateOf(stat: ProportionStat, t: Translate): RateLine {
  const line = rateLine(stat, t);
  if (line !== null) return line;
  return {
    rate: t('stats.none'),
    n: 0,
    sample: t('stats.none'),
    interval: t('stats.none'),
    text: t('stats.none'),
  };
}

/**
 * The sentence of a row: what the cohort says alone, what it says once
 * aggregated, and how much strength was borrowed. Said in clear words, in
 * both languages.
 */
function headline(
  own: RateLine,
  pooled: RateLine,
  siblings: number,
  share: number,
): { readonly fr: string; readonly en: string } {
  if (share <= 0) {
    return {
      fr: `Cohorte de ${own.n} tickets : ${own.interval} seule — rien n'est emprunté, elle se suffit à elle-même.`,
      en: `Cohort of ${own.n} tickets: ${own.interval} on its own — nothing is borrowed, it is enough on its own.`,
    };
  }
  const frSiblings = `${siblings} ${siblings === 1 ? 'cohorte' : 'cohortes'} de même nature`;
  const enSiblings = `${siblings} ${siblings === 1 ? 'cohort' : 'cohorts'} of the same nature`;
  return {
    fr: `Cohorte de ${own.n} tickets : ${own.interval} seule, ${pooled.interval} une fois agrégée avec les ${frSiblings} — moins affirmatif, mais plus informative (${share} % de force empruntée).`,
    en: `Cohort of ${own.n} tickets: ${own.interval} on its own, ${pooled.interval} once aggregated with the ${enSiblings} — less assertive, but more informative (${share} % of the strength borrowed).`,
  };
}

/** One cohort, rendered: its own rate, its pooled rate, and what was borrowed. */
function rowView(input: PoolingInput, estimate: PooledEstimate, t: Translate): PoolingRowView {
  const own = rateOf(estimate.own, t);
  const pooled = rateOf(estimate.pooled, t);
  const siblings = Math.max(0, Math.floor(input.prior.observations));
  const share = Math.round(estimate.borrowedStrength * 100);
  return {
    cohortKey: input.cohortKey,
    own,
    pooled,
    siblings,
    borrowedShare: estimate.borrowedStrength,
    borrowedShareText: percent(estimate.borrowedStrength),
    shrunk: estimate.shrunk,
    headline: headline(own, pooled, siblings, share),
    note: estimate.note,
  };
}

/**
 * Projects the pooling: one row per cohort, the interval it has alone and the
 * interval it has once aggregated with its siblings of the same nature, and
 * the share of the borrowed strength. An empty list renders its explicit
 * "nothing to pool" line, never a zero (SPEC §20).
 */
export function poolingView(inputs: readonly PoolingInput[], t: Translate): PoolingView {
  const estimates = poolCohorts(inputs);
  const rows = inputs.map((input, index) => rowView(input, estimates[index], t));
  return {
    title: TITLE,
    rows,
    emptyNotice: rows.length === 0 ? EMPTY_NOTICE : null,
  };
}
