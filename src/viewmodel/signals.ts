/**
 * The weak signals of the involvement, as a screen shows it (SPEC §5; DP-02,
 * DP-03, DP-19).
 *
 * Why: 41 % of the tickets have an unknown involvement, and that is the
 * biggest hole in the data. The mentions are the only proof the app accepts;
 * the signals here — the shape of the diff, the regularity of the commits, a
 * bot author — are **weak**: they come with their measured precision, and a
 * signal that was never calibrated stays silent instead of asserting anything.
 *
 * The product use is not to decide but to **prioritise the collection**: which
 * tickets to read first, because they would carry the most missing information.
 *
 * The viewmodel computes nothing: `src/domain/signals.ts` owns the features,
 * the score, the measured precision and the collection plan. This module only
 * projects them.
 *
 * The confidence is a proportion — sample size and interval included —
 * rendered by `rateLine` (`./common.js`), never a bare number (recipe 10).
 *
 * Pure module: no `@forge/*`, no clock.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type {
  SignalCommit,
  SignalFeatures,
  UnknownCandidate,
  UnknownPlan,
  WeakSignal,
} from '../domain/signals.js';
import {
  DEFAULT_SIGNALS,
  extractFeatures,
  prioritiseUnknown,
  scoreInvolvement,
} from '../domain/signals.js';
import { percent } from '../domain/stats.js';
import type { Lang } from '../i18n/index.js';
import { createTranslator } from '../i18n/index.js';
import type { Bilingual, RateLine } from './common.js';
import { rateLine } from './common.js';

/** The title of the screen, in both languages (SPEC §16). */
const TITLE: Bilingual = {
  fr: 'Les signaux faibles',
  en: 'The weak signals',
};

/** The line that says the score is a score, not a proof. */
const NOT_A_PROOF: Bilingual = {
  fr: "Un score de signaux faibles n'est pas une preuve : les mentions restent la seule preuve acceptée.",
  en: 'A weak-signal score is not a proof: mentions remain the only proof accepted.',
};

/** The line that says the signals are not calibrated yet. */
const NOT_CALIBRATED: Bilingual = {
  fr: "Aucun signal n'est calibré : la précision n'est pas mesurée, elle reste vide.",
  en: 'No signal is calibrated: the precision is not measured, it stays empty.',
};

/** Why a signal fired, ready to be rendered. */
export interface SignalReasonView {
  /** The identifier of the signal. */
  readonly id: string;
  /** How much the signal moves the score, in [0, 1]. */
  readonly weight: number;
  /** What the domain says about it, in both languages. */
  readonly note: Bilingual;
}

/** The signals of one ticket, ready to be rendered. */
export interface SignalsView {
  readonly title: Bilingual;
  /** The score, between 0 and 1. */
  readonly score: number;
  /** The score, as a percentage. */
  readonly scoreText: string;
  /** The measured precision of the signals that fired, with its interval. */
  readonly confidence: RateLine | null;
  /** Why each signal fired. */
  readonly reasons: readonly SignalReasonView[];
  /** True when no calibrated signal fired: the confidence is empty. */
  readonly uncalibrated: boolean;
  /** The explicit line when the signals are not calibrated. */
  readonly uncalibratedNotice: Bilingual | null;
  /** The line that says a score is not a proof. */
  readonly notAProof: Bilingual;
}

/**
 * Projects the weak signals of one ticket.
 *
 * The features come from the commits (the domain extracts them); the score and
 * the measured precision come from the domain too.
 */
export function signalsView(
  commits: readonly SignalCommit[],
  signals: readonly WeakSignal[] = DEFAULT_SIGNALS,
  lang: Lang = 'fr',
): SignalsView {
  const t = createTranslator(lang);
  const features: SignalFeatures = extractFeatures(commits);
  const score = scoreInvolvement(features, signals);
  const confidence = score.confidence.n > 0 ? rateLine(score.confidence, t) : null;
  return {
    title: TITLE,
    score: score.score,
    scoreText: percent(score.score),
    confidence,
    reasons: score.reasons.map((reason) => ({
      id: reason.id,
      weight: reason.weight,
      note: reason.note,
    })),
    uncalibrated: score.confidence.n === 0,
    uncalibratedNotice: score.confidence.n === 0 ? NOT_CALIBRATED : null,
    notAProof: NOT_A_PROOF,
  };
}

/** One ticket of the collection plan, ready to be rendered. */
export interface UnknownPlanLine {
  /** The ticket to read first. */
  readonly issueKey: string;
  /** Share of the cohort's missing information the ticket settles, in [0, 1]. */
  readonly expectedGain: number;
  /** The same share, as a percentage. */
  readonly expectedGainText: string;
  /** What the domain says about it, in both languages. */
  readonly note: Bilingual;
}

/** The collection plan for the unknown tickets, ready to be rendered. */
export interface UnknownPlanView {
  /** The tickets to read, in the order of the plan. */
  readonly issueIds: readonly string[];
  /** Why each one comes first. */
  readonly lines: readonly UnknownPlanLine[];
  /** Share of the unknown tickets the plan covers, in [0, 1]. */
  readonly coverageShare: number;
  /** The same share, as a percentage. */
  readonly coverageShareText: string;
}

/**
 * Projects the collection plan for the tickets of unknown involvement.
 *
 * The order and the expected gain come from the domain: this module only
 * renders them.
 */
export function unknownPlanView(
  candidates: readonly UnknownCandidate[],
  cohortSizes: Readonly<Record<string, number>>,
  scores: Readonly<Record<string, number>>,
  budget: number,
): UnknownPlanView {
  const plan: UnknownPlan = prioritiseUnknown(candidates, cohortSizes, scores, budget);
  return {
    issueIds: plan.issueIds,
    lines: plan.rationale.map((item) => ({
      issueKey: item.issueKey,
      expectedGain: item.expectedGain,
      expectedGainText: percent(item.expectedGain),
      note: item.note,
    })),
    coverageShare: plan.coverageShare,
    coverageShareText: percent(plan.coverageShare),
  };
}
