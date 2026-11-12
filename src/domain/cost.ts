/**
 * What the two options cost, cohort by cohort.
 *
 * Why: the recommendation is technical, the adoption is economic. "Agent,
 * hardened review" only becomes a decision when it reads "+12 points of
 * quality, −40 % of cost, +3 hours of review" — and a cost computed on
 * assumptions must **say** it is computed on assumptions. That is why every
 * figure here comes with the model that produced it, and why the quality
 * difference travels as a proportion (sample size and interval included), never
 * as a bare number.
 *
 * The domain is pure: no `@forge/*`, no network, no clock.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { proportion } from './stats.js';
import type { ProportionStat } from '../types.js';

/** The cost assumptions — a model, not a measurement (SPEC §20). */
export interface CostModel {
  /** Cost of the tokens an agent run consumes, in euros. */
  readonly tokenCostPerRun: number;
  /** Cost of the machine an agent run occupies, in euros. */
  readonly machineCostPerRun: number;
  /** Hours of review a delegated ticket adds, per ticket. */
  readonly reviewHoursPerTicket: number;
  /** Hours of rework a delegated ticket causes on average, per ticket. */
  readonly reworkHoursPerTicket: number;
  /** Hours a human needs for the same ticket. */
  readonly humanHoursPerTicket: number;
  /** Hourly cost of a human, in euros. */
  readonly humanHourlyCost: number;
}

/** The default assumptions, documented so a team can argue with them. */
export const DEFAULT_COST_MODEL: CostModel = {
  tokenCostPerRun: 0.12,
  machineCostPerRun: 0.04,
  reviewHoursPerTicket: 0.5,
  reworkHoursPerTicket: 0.25,
  humanHoursPerTicket: 4,
  humanHourlyCost: 55,
};

/** What one cohort costs under each option. */
export interface CohortCost {
  readonly cohortKey: string;
  /** Cost of doing it with an agent, in euros. */
  readonly agentCost: number;
  /** Cost of doing it with a human, in euros. */
  readonly humanCost: number;
  /** What the agent option saves, in euros (negative when it costs more). */
  readonly saved: number;
  /** Share of the human cost the agent option avoids, in [0, 1]. */
  readonly savedShare: number;
  /** Quality difference, in points of clean close (positive = the agent is better). */
  readonly qualityDelta: number;
  /** The same difference, as a proportion: sample size and interval included. */
  readonly quality: ProportionStat;
  /** Review hours the delegation adds, per ticket. */
  readonly reviewHours: number;
  /** What these figures are, in both languages. */
  readonly note: { readonly fr: string; readonly en: string };
}

/** The input of a cohort's cost: the outcome of both arms. */
export interface CohortCostInput {
  readonly cohortKey: string;
  readonly agentClean: number;
  readonly agentTotal: number;
  readonly humanClean: number;
  readonly humanTotal: number;
  /** Reopenings the agent option caused, per ticket (rework). */
  readonly reopenings: number;
}

/**
 * The cost of one cohort under the two options.
 *
 * Agent cost = machine + tokens + review hours + rework hours, all valued at the
 * human hourly rate (a review hour is a human hour). Human cost = the hours the
 * same work takes, valued at the same rate.
 */
export function cohortCost(
  input: CohortCostInput,
  costModel: CostModel = DEFAULT_COST_MODEL,
): CohortCost {
  if (input.agentTotal <= 0) {
    // Rien n'est délégué dans cette cohorte : la comparaison n'a pas d'objet,
    // et afficher « 100 % économisé » serait un mensonge.
    return {
      cohortKey: input.cohortKey,
      agentCost: 0,
      humanCost: round(costModel.humanHoursPerTicket * input.humanTotal * costModel.humanHourlyCost),
      saved: 0,
      savedShare: 0,
      qualityDelta: 0,
      quality: { n: 0, rate: 0, ciLow: 0, ciHigh: 0 },
      reviewHours: 0,
      note: {
        fr: 'Aucun ticket délégué dans cette cohorte : la comparaison de coût n’a pas d’objet.',
        en: 'No delegated ticket in this cohort: the cost comparison does not apply.',
      },
    };
  }
  const agentStat = proportion(input.agentClean, input.agentTotal);
  const humanStat = proportion(input.humanClean, input.humanTotal);
  const runCost = costModel.tokenCostPerRun + costModel.machineCostPerRun;
  const reworkHours = input.reopenings * costModel.reworkHoursPerTicket;
  const reviewHours = costModel.reviewHoursPerTicket * input.agentTotal;
  const agentCost = runCost * input.agentTotal
    + (reviewHours + reworkHours) * costModel.humanHourlyCost;
  const humanCost = costModel.humanHoursPerTicket * input.humanTotal * costModel.humanHourlyCost;
  const saved = humanCost - agentCost;
  // La différence de qualité, exprimée comme une proportion : la borne basse
  // est la plus conservatrice (le bas du bras agent moins le haut du bras
  // humain), la borne haute la plus favorable. Un intervalle qui contient zéro
  // signifie « rien d'établi » — exactement la règle du SPEC §7.
  const quality: ProportionStat = {
    n: agentStat.n,
    rate: round4(agentStat.rate - humanStat.rate),
    ciLow: round4(agentStat.ciLow - humanStat.ciHigh),
    ciHigh: round4(agentStat.ciHigh - humanStat.ciLow),
  };
  return {
    cohortKey: input.cohortKey,
    agentCost: round(agentCost),
    humanCost: round(humanCost),
    saved: round(saved),
    savedShare: humanCost > 0 ? clamp(saved / humanCost) : 0,
    qualityDelta: round((agentStat.rate - humanStat.rate) * 100),
    quality,
    reviewHours: round(reviewHours),
    note: {
      fr: 'Coût calculé sur un modèle d’hypothèses (à régler), pas sur une mesure : la qualité est donnée avec son effectif et sa fourchette.',
      en: 'Cost computed on an assumption model (to be tuned), not on a measurement: quality comes with its sample size and interval.',
    },
  };
}

/** The portfolio: what the whole set of cohorts costs, and what it saves. */
export interface PortfolioCost {
  readonly totalAgent: number;
  readonly totalHuman: number;
  readonly saved: number;
  readonly savedShare: number;
  /** Quality weighted by the size of the cohorts, in points. */
  readonly qualityWeighted: number;
}

/** Aggregates the cost of several cohorts. */
export function portfolioCost(cohorts: readonly CohortCost[]): PortfolioCost {
  const totalAgent = cohorts.reduce((total, cohort) => total + cohort.agentCost, 0);
  const totalHuman = cohorts.reduce((total, cohort) => total + cohort.humanCost, 0);
  const weight = cohorts.reduce((total, cohort) => total + cohort.quality.n, 0);
  const qualityWeighted = weight === 0
    ? 0
    : cohorts.reduce((total, cohort) => total + cohort.qualityDelta * cohort.quality.n, 0) / weight;
  const saved = totalHuman - totalAgent;
  return {
    totalAgent: round(totalAgent),
    totalHuman: round(totalHuman),
    saved: round(saved),
    savedShare: totalHuman > 0 ? clamp(saved / totalHuman) : 0,
    qualityWeighted: round(qualityWeighted),
  };
}

function clamp(value: number): number {
  if (value < 0) return 0;
  return value > 1 ? 1 : value;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
