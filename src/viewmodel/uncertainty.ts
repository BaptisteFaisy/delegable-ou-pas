/**
 * The measured uncertainty of a cohort, as a screen shows it (SPEC §5, §7;
 * DP-03, DP-19, recipe 10).
 *
 * Why: "41 % of the tickets have an unknown involvement" is a percentage, not a
 * measurement. Measured, it becomes a work target: how many bits of
 * information are missing, how many tickets would settle this cohort, how
 * likely the advice is to flip. The grey on the map stops being a wall and
 * becomes a to-do list.
 *
 * The viewmodel computes nothing: `src/domain/uncertainty.ts` owns the
 * entropy, the number of tickets to collect, the flip probability and the
 * blockers. This module only projects them, in the language of the screen.
 *
 * Every rate is rendered by `rateLine` (`./common.js`), so it always carries
 * its sample size and its interval (recipe 10). A measurement that does not
 * exist stays `null`, never a zero (SPEC §20).
 *
 * Pure module: no `@forge/*`, no clock.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Conclusion } from '../types.js';
import type { InvolvementLevel } from '../domain/uncertainty.js';
import {
  flipProbability,
  ticketsToChangeConclusion,
  uncertaintyReport,
  unknownEntropy,
} from '../domain/uncertainty.js';
import { percent } from '../domain/stats.js';
import type { Lang } from '../i18n/index.js';
import { createTranslator } from '../i18n/index.js';
import type { Bilingual, RateLine } from './common.js';
import { rateLine } from './common.js';

/** The title of the screen, in both languages (SPEC §16). */
const TITLE: Bilingual = {
  fr: "L'incertitude mesurée",
  en: 'The measured uncertainty',
};

/** What the screen says when there is nothing to measure yet. */
const NO_MEASUREMENT: Bilingual = {
  fr: "Aucune implication ne peut être lue : la bascule de l'avis ne peut pas être chiffrée.",
  en: 'No involvement can be read: the flip of the advice cannot be quantified.',
};

/** What the screen needs to know about a cohort. */
export interface UncertaintyViewInput {
  /** The involvement of every ticket of the cohort, as the collector sees it. */
  readonly involvements: readonly InvolvementLevel[];
  /** The conclusion the cohort carries today. */
  readonly conclusion: Conclusion;
  /** The key of the cohort, so the action names it. */
  readonly cohortKey: string;
  /** The size of the arm the advice rests on. */
  readonly n: number;
  /** The clean closures observed in that arm. */
  readonly clean: number;
  /** The arm size the cohort would need to conclude. */
  readonly threshold: number;
  /** How many tickets one collection settles (one by default). */
  readonly perTicket?: number;
  /** The clean rate to reach, when it differs from the threshold. */
  readonly targetClean?: number;
}

/** The uncertainty of a cohort, ready to be rendered. */
export interface UncertaintyView {
  readonly title: Bilingual;
  /** Share of tickets whose involvement is unknown, in [0, 1]. */
  readonly unknownShare: number;
  /** The same share, as a percentage. */
  readonly unknownShareText: string;
  /** Entropy of the involvement distribution, in bits. */
  readonly bits: number;
  /** How many tickets would have to be clarified to decide. */
  readonly ticketsToDecide: number;
  /** What the domain says about the unknown, in both languages. */
  readonly entropyNote: Bilingual;
  /** How many tickets are still missing before a conclusion is possible. */
  readonly reachNote: Bilingual;
  /** How likely the advice is to flip, with its sample size and its interval. */
  readonly flipLine: RateLine | null;
  /** The explicit line when the flip cannot be measured. */
  readonly flipNotice: Bilingual | null;
  /** True when a conclusion is possible today. */
  readonly canConclude: boolean;
  /** The named blockers of the conclusion, as the domain words them. */
  readonly blockers: readonly string[];
  /** The collection actions the domain recommends, as the domain words them. */
  readonly nextCollect: readonly string[];
  /** The summary of the domain, in both languages. */
  readonly reportNote: Bilingual;
}

/**
 * Projects the measured uncertainty of a cohort.
 *
 * Without data the screen renders its explicit "nothing to measure" line and
 * an empty flip, never a zero and never an exception (SPEC §20).
 */
export function uncertaintyView(input: UncertaintyViewInput, lang: Lang): UncertaintyView {
  const t = createTranslator(lang);
  const entropy = unknownEntropy(input.involvements, input.perTicket ?? 1);
  const reach = ticketsToChangeConclusion({
    n: input.n,
    clean: input.clean,
    threshold: input.threshold,
    targetClean: input.targetClean,
  });
  const report = uncertaintyReport({
    unknown: entropy,
    conclusion: input.conclusion,
    cohortKey: input.cohortKey,
  });
  const flip = flipProbability({ n: input.n, clean: input.clean, unknownShare: entropy.share });
  // Sans aucune implication lue, la bascule n'est pas mesurable : elle reste
  // absente, pas un zéro qui ressemble à une mesure (SPEC §20).
  const measurable = input.involvements.length > 0;
  const flipLine = measurable ? rateLine(flip, t) : null;
  return {
    title: TITLE,
    unknownShare: entropy.share,
    unknownShareText: percent(entropy.share),
    bits: entropy.bits,
    ticketsToDecide: entropy.ticketsToDecide,
    entropyNote: entropy.note,
    reachNote: reach.note,
    flipLine,
    flipNotice: flipLine === null ? NO_MEASUREMENT : null,
    canConclude: report.canConclude,
    blockers: report.blockers,
    nextCollect: report.nextCollect,
    reportNote: report.note,
  };
}
