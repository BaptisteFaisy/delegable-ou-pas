/**
 * The night queue and the morning report, as a screen shows it (SPEC §27;
 * DP-21, DP-24).
 *
 * Why: the specification ends on the night queue — a ready, allowed,
 * collision-free, reviewable, delegable ticket goes out alone in the night,
 * and in the morning a report says what was done, what was proven, and what
 * was left. The domain selects the tickets and writes the report; it does not
 * run the agent (that is the orchestrator's job) and it does not take the
 * decision (that is the developer's).
 *
 * The viewmodel computes nothing: `src/domain/coordinator.ts` owns the
 * selection, the skip reasons and the morning figures. This module only
 * projects them, in the two languages of the app.
 *
 * Every excluded ticket is named — a silent skip would be the worst thing a
 * queue can do (SPEC §27).
 *
 * Pure module: no `@forge/*`, no clock.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { NightCandidate, NightOutcome, SkipReason } from '../domain/coordinator.js';
import { morningReport, selectForNight } from '../domain/coordinator.js';
import type { Lang } from '../i18n/index.js';
import { createTranslator } from '../i18n/index.js';
import type { Bilingual, RateLine } from './common.js';
import { rateLine } from './common.js';

/** The title of the screen, in both languages (SPEC §16). */
const TITLE: Bilingual = {
  fr: 'La file de nuit',
  en: 'The night queue',
};

/** The title of the morning report, in both languages. */
const MORNING_TITLE: Bilingual = {
  fr: 'Le bilan du matin',
  en: 'The morning report',
};

/** Why a ticket stayed behind, in both languages. */
const REASON_LABELS: Readonly<Record<SkipReason, Bilingual>> = {
  'not-ready': { fr: 'pas prêt', en: 'not ready' },
  urgent: { fr: 'urgent', en: 'urgent' },
  sensitive: { fr: 'zone sensible', en: 'sensitive zone' },
  'no-criteria': { fr: "sans critères d'acceptation", en: 'no acceptance criteria' },
  'not-reviewable': { fr: 'non relisible', en: 'not reviewable' },
  collision: { fr: 'collision de code', en: 'code collision' },
  'not-delegable': { fr: 'à garder pour un humain', en: 'to keep for a human' },
  budget: { fr: 'budget atteint', en: 'budget reached' },
};

/** One ticket left behind, ready to be rendered. */
export interface SkippedLine {
  /** The ticket that stayed behind. */
  readonly issueKey: string;
  /** The rule it broke. */
  readonly reason: SkipReason;
  /** The rule, in both languages. */
  readonly reasonLabel: Bilingual;
}

/** The night queue, ready to be rendered. */
export interface CoordinatorView {
  readonly title: Bilingual;
  /** The tickets that go out tonight. */
  readonly taken: readonly string[];
  /** The tickets left behind, each with its reason. */
  readonly skipped: readonly SkippedLine[];
  /** The budget of the night, in minutes. */
  readonly budgetMinutes: number;
  /** The summary of the domain, in both languages. */
  readonly note: Bilingual;
}

/**
 * Projects the night queue.
 *
 * The selection is the domain's: this module renders who goes, who stays and
 * why, without deciding anything (SPEC §27).
 */
export function coordinatorView(
  candidates: readonly NightCandidate[],
  budgetMinutes: number,
): CoordinatorView {
  const plan = selectForNight(candidates, budgetMinutes);
  return {
    title: TITLE,
    taken: plan.taken,
    skipped: plan.skipped.map((item) => ({
      issueKey: item.issueKey,
      reason: item.reason,
      reasonLabel: REASON_LABELS[item.reason],
    })),
    budgetMinutes: plan.budgetMinutes,
    note: plan.note,
  };
}

/** The morning report, ready to be rendered. */
export interface MorningView {
  readonly title: Bilingual;
  /** The tickets the night took. */
  readonly taken: readonly string[];
  /** The tickets whose proof was established. */
  readonly proven: readonly string[];
  /** The tickets left behind, each with its reason. */
  readonly left: readonly SkippedLine[];
  /** How many tickets were reopened. */
  readonly reopened: number;
  /** The clean-close rate of the tickets taken, with its interval. */
  readonly cleanClosed: RateLine | null;
  /** The summary of the domain, in both languages. */
  readonly note: Bilingual;
}

/**
 * Projects the morning report of one night.
 *
 * The clean-close rate is a proportion: sample size and interval included
 * (recipe 10). With no ticket taken, the rate stays `null` — never a zero
 * that looks like a measurement (SPEC §20).
 */
export function morningView(
  plan: CoordinatorView,
  outcomes: readonly NightOutcome[],
  lang: Lang = 'fr',
): MorningView {
  const t = createTranslator(lang);
  const report = morningReport({
    plan: {
      taken: plan.taken,
      skipped: plan.skipped.map((item) => ({ issueKey: item.issueKey, reason: item.reason })),
      budgetMinutes: plan.budgetMinutes,
      note: plan.note,
    },
    outcomes,
  });
  const clean = report.cleanClosed.n > 0 ? rateLine(report.cleanClosed, t) : null;
  return {
    title: MORNING_TITLE,
    taken: report.taken,
    proven: report.proven,
    left: report.left.map((item) => ({
      issueKey: item.issueKey,
      reason: 'budget',
      reasonLabel: REASON_LABELS.budget,
    })),
    reopened: report.reopened,
    cleanClosed: clean,
    note: report.note,
  };
}
