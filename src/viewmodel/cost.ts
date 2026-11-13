/**
 * The compared cost of the two options, as a screen shows it (SPEC §8, §20).
 *
 * Why: the recommendation is technical, the adoption is economic. "Agent,
 * hardened review" only becomes a decision when it reads "+12 points of
 * quality, −40 % of cost, +3 hours of review" — and a cost computed on
 * assumptions must **say** it is computed on assumptions.
 *
 * The viewmodel computes nothing: `src/domain/cost.ts` owns the euros, the
 * saved share and the quality difference. This module only projects them.
 *
 * The quality difference travels as a proportion — sample size and interval
 * included — rendered by `rateLine` (`./common.js`), never as a bare number
 * (SPEC §7 rule 3, recipe 10).
 *
 * Pure module: no `@forge/*`, no clock.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { CohortCost, CostModel, PortfolioCost } from '../domain/cost.js';
import { cohortCost, portfolioCost } from '../domain/cost.js';
import { percent } from '../domain/stats.js';
import type { Lang } from '../i18n/index.js';
import { createTranslator } from '../i18n/index.js';
import type { Bilingual, RateLine } from './common.js';
import { rateLine } from './common.js';

/** The title of the screen, in both languages (SPEC §16). */
const TITLE: Bilingual = {
  fr: 'Le coût comparé',
  en: 'The compared cost',
};

/** The line that names the cost of the agent option. */
const AGENT_COST: Bilingual = {
  fr: 'Avec agent',
  en: 'With an agent',
};

/** The line that names the cost of the human option. */
const HUMAN_COST: Bilingual = {
  fr: 'Sans agent',
  en: 'Without an agent',
};

/** The line that names what the agent option saves. */
const SAVED: Bilingual = {
  fr: 'Économie',
  en: 'Saving',
};

/** The line that names the review load the delegation adds. */
const REVIEW: Bilingual = {
  fr: 'Relecture ajoutée',
  en: 'Review added',
};

/** The line that names the quality difference. */
const QUALITY: Bilingual = {
  fr: 'Différence de qualité',
  en: 'Quality difference',
};

/** The line that says the comparison has no object. */
const NO_OBJECT: Bilingual = {
  fr: "La comparaison de coût n'a pas d'objet : aucun ticket délégué dans cette cohorte.",
  en: 'The cost comparison does not apply: no delegated ticket in this cohort.',
};

/** What the screen needs to know about one cohort. */
export interface CostViewInput {
  /** The key of the cohort (nature × zone × size). */
  readonly cohortKey: string;
  /** Clean closures observed with an agent. */
  readonly agentClean: number;
  /** Tickets handled with an agent. */
  readonly agentTotal: number;
  /** Clean closures observed without an agent. */
  readonly humanClean: number;
  /** Tickets handled without an agent. */
  readonly humanTotal: number;
  /** Reopenings the agent option caused, per ticket. */
  readonly reopenings: number;
  /** The assumptions of the cost model, when the team tuned them. */
  readonly model?: CostModel;
}

/** The cost of one cohort under the two options, ready to be rendered. */
export interface CostView {
  readonly title: Bilingual;
  /** The key of the cohort. */
  readonly cohortKey: string;
  /** The cost of the agent option, in euros. */
  readonly agentLabel: Bilingual;
  readonly agentCost: string;
  /** The cost of the human option, in euros. */
  readonly humanLabel: Bilingual;
  readonly humanCost: string;
  /** What the agent option saves, in euros (negative when it costs more). */
  readonly savedLabel: Bilingual;
  readonly saved: string;
  /** Share of the human cost the agent option avoids, in [0, 1]. */
  readonly savedShare: number;
  readonly savedShareText: string;
  /** Quality difference, in points of clean close. */
  readonly qualityLabel: Bilingual;
  readonly qualityDelta: number;
  /** The same difference, as a proportion with its sample size and interval. */
  readonly quality: RateLine | null;
  /** Review hours the delegation adds, per ticket. */
  readonly reviewLabel: Bilingual;
  readonly reviewHours: number;
  /** True when the comparison has no object (no delegated ticket). */
  readonly noObject: boolean;
  /** The explicit "no object" line, or `null` when there is a comparison. */
  readonly noObjectNotice: Bilingual | null;
  /** What the domain says about these figures, in both languages. */
  readonly note: Bilingual;
}

/**
 * Projects the compared cost of one cohort.
 *
 * A cohort with no delegated ticket renders its explicit "no object" line and
 * no figure, rather than a fake "100 % saved" (SPEC §20).
 */
export function costView(input: CostViewInput, lang: Lang): CostView {
  const t = createTranslator(lang);
  const cost: CohortCost = cohortCost(input, input.model);
  const quality = cost.quality.n > 0 ? rateLine(cost.quality, t) : null;
  return {
    title: TITLE,
    cohortKey: cost.cohortKey,
    agentLabel: AGENT_COST,
    agentCost: euros(cost.agentCost),
    humanLabel: HUMAN_COST,
    humanCost: euros(cost.humanCost),
    savedLabel: SAVED,
    saved: euros(cost.saved),
    savedShare: cost.savedShare,
    savedShareText: percent(cost.savedShare),
    qualityLabel: QUALITY,
    qualityDelta: cost.qualityDelta,
    quality,
    reviewLabel: REVIEW,
    reviewHours: cost.reviewHours,
    noObject: cost.agentCost === 0 && cost.saved === 0 && cost.quality.n === 0,
    noObjectNotice: cost.quality.n === 0 ? NO_OBJECT : null,
    note: cost.note,
  };
}

/** The cost of the whole portfolio of cohorts, ready to be rendered. */
export interface PortfolioCostView {
  readonly title: Bilingual;
  /** Total cost of the agent option, in euros. */
  readonly totalAgent: string;
  /** Total cost of the human option, in euros. */
  readonly totalHuman: string;
  /** What the agent option saves on the portfolio, in euros. */
  readonly saved: string;
  /** Share of the human cost avoided, in [0, 1]. */
  readonly savedShare: number;
  readonly savedShareText: string;
  /** Quality weighted by the size of the cohorts, in points. */
  readonly qualityWeighted: number;
  /** The explicit line when the portfolio has no cohort. */
  readonly emptyNotice: Bilingual | null;
}

/** What the screen says when there is no cohort to compare. */
const EMPTY: Bilingual = {
  fr: "Aucune cohorte à comparer : le coût du portefeuille n'est pas calculé.",
  en: 'No cohort to compare: the portfolio cost is not computed.',
};

/**
 * Projects the cost of a whole portfolio of cohorts.
 *
 * The figures come from `portfolioCost`; an empty portfolio renders its
 * explicit line rather than a zero (SPEC §20).
 */
export function portfolioCostView(
  cohorts: readonly CohortCost[],
  lang: Lang,
): PortfolioCostView {
  const total: PortfolioCost = portfolioCost(cohorts);
  const empty = cohorts.length === 0;
  void lang;
  return {
    title: TITLE,
    totalAgent: euros(total.totalAgent),
    totalHuman: euros(total.totalHuman),
    saved: euros(total.saved),
    savedShare: total.savedShare,
    savedShareText: percent(total.savedShare),
    qualityWeighted: total.qualityWeighted,
    emptyNotice: empty ? EMPTY : null,
  };
}

/** Formats an amount in euros, with its two decimals. */
function euros(value: number): string {
  return `${value.toFixed(2)} €`;
}
