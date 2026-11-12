/**
 * The simulation screen as a projection (SPEC §7, §8, §16; DP-08, DP-09,
 * DP-12, recipe 10).
 *
 * The screen says out loud what the simulation found: "if we lowered the
 * threshold to 15, we would delegate 12 more tickets and avoid 3 reopenings,
 * 95 % CI […]" — in French and in English — then the gap of each cohort.
 *
 * A viewmodel is a projection (SPEC §20, docs/CONTRACTS.md §L8): it formats
 * what the domain computed and calls the domain for everything else. No
 * formula lives here — no rate is recomputed, no interval is re-derived, no
 * threshold is re-evaluated. The rate is rendered through the shared helpers
 * of `src/domain/stats.ts` and always with its sample size and its interval
 * (SPEC §7 rule 3, recipe 10).
 *
 * The visible texts carry `{ fr, en }` (the interface is bilingual, SPEC §20);
 * this lot does not touch the i18n catalogue.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

import type { Conclusion, ProportionStat } from '../types.js';
import { percent, percentCeil, percentFloor } from '../domain/stats.js';
import { gapEstablished } from '../domain/conclusion.js';
import { simulate, simulateCohorts } from '../domain/simulation.js';
import type {
  CohortSimulation,
  PolicyVariant,
  SimulationDelta,
  SimulationInput,
  SimulationSummary,
} from '../domain/simulation.js';

/** A visible sentence, in French and in English. */
export interface Line {
  readonly fr: string;
  readonly en: string;
}

/** One policy, as the screen shows it. */
export interface SimulationSummaryView {
  readonly label: Line;
  readonly threshold: Line;
  readonly delegated: Line;
  readonly kept: Line;
  readonly reopenings: Line;
  readonly cleanRate: Line;
  readonly medianLead: Line;
}

/** The gap of one cohort, as the screen shows it. */
export interface CohortGapView {
  readonly cohortKey: string;
  readonly delegatedDelta: number;
  readonly reopeningsAvoided: number;
  readonly line: Line;
}

/** The simulation screen. */
export interface SimulationView {
  /** True when there is nothing to replay: the screen says so, it never guesses. */
  readonly empty: boolean;
  readonly title: Line;
  readonly headline: Line;
  readonly baseline: SimulationSummaryView;
  readonly variant: SimulationSummaryView;
  /** The clean-closure rate of the simulated population, with its interval. */
  readonly rate: Line;
  readonly conclusion: Line;
  readonly cohorts: readonly CohortGapView[];
  readonly note: Line;
}

/** The title of the screen, in the two languages of the app. */
const TITLE: Line = {
  fr: 'Simulation — et si on changeait la règle ?',
  en: 'Simulation — what if we changed the rule?',
};

/* ------------------------------------------------------------------- lines */

/** A rate with its sample size and its interval (recipe 10), in both languages. */
function rateLine(stat: ProportionStat): Line {
  const rate = percent(stat.rate);
  const low = percentFloor(stat.ciLow);
  const high = percentCeil(stat.ciHigh);
  return {
    fr: `${rate} de clôtures propres (n = ${stat.n}, IC 95 % [${low} ; ${high}])`,
    en: `${rate} clean closures (n = ${stat.n}, 95% CI [${low} ; ${high}])`,
  };
}

/** The median delay of the delegated population, or the explicit absence. */
function medianLine(summary: SimulationSummary): Line {
  if (summary.medianLeadH === null) {
    return { fr: 'Aucune durée mesurée', en: 'No duration measured' };
  }
  return {
    fr: `Délai médian ${summary.medianLeadH} h (n = ${summary.delegated})`,
    en: `Median delay ${summary.medianLeadH} h (n = ${summary.delegated})`,
  };
}

/** One policy, projected: what it does with the population. */
function summaryView(policy: PolicyVariant, summary: SimulationSummary): SimulationSummaryView {
  return {
    label: policy.label,
    threshold: {
      fr: `Seuil ${policy.threshold} tickets par bras`,
      en: `Threshold ${policy.threshold} tickets per arm`,
    },
    delegated: {
      fr: `${summary.delegated} tickets délégués`,
      en: `${summary.delegated} tickets delegated`,
    },
    kept: {
      fr: `${summary.kept} tickets conservés`,
      en: `${summary.kept} tickets kept`,
    },
    reopenings: {
      fr: `${summary.reopenings} réouvertures restantes`,
      en: `${summary.reopenings} reopenings remaining`,
    },
    cleanRate: rateLine(summary.rate),
    medianLead: medianLine(summary),
  };
}

/** How the threshold moves, in the two languages. */
function directionOf(from: number, to: number): Line {
  if (to < from) return { fr: 'abaissons', en: 'lowered' };
  if (to > from) return { fr: 'relevions', en: 'raised' };
  return { fr: 'gardons', en: 'kept' };
}

/** The headline: what the screen says in plain words. */
function headlineLine(baseline: PolicyVariant, variant: PolicyVariant, delta: SimulationDelta): Line {
  const direction = directionOf(baseline.threshold, variant.threshold);
  const fr = `Si on ${direction.fr} le seuil à ${variant.threshold}, on déléguerait `
    + `${Math.abs(delta.delegatedDelta)} tickets `
    + `${delta.delegatedDelta >= 0 ? 'de plus' : 'de moins'} et on `
    + `${delta.reopeningsAvoided >= 0 ? 'éviterait' : 'subirait'} `
    + `${Math.abs(delta.reopeningsAvoided)} réouvertures.`;
  const en = `If we ${direction.en} the threshold to ${variant.threshold}, we would delegate `
    + `${Math.abs(delta.delegatedDelta)} `
    + `${delta.delegatedDelta >= 0 ? 'more' : 'fewer'} tickets and `
    + `${delta.reopeningsAvoided >= 0 ? 'avoid' : 'add'} `
    + `${Math.abs(delta.reopeningsAvoided)} reopenings.`;
  return { fr, en };
}

/** The verdict of SPEC §7 rule 4, with its "established gap" wording. */
function conclusionLine(conclusion: Conclusion): Line {
  if (conclusion === 'not-enough-data') {
    return { fr: 'Pas assez de recul', en: 'Not enough data' };
  }
  const established = gapEstablished(conclusion);
  const fr = conclusion === 'better' ? 'Mieux' : conclusion === 'worse' ? 'Moins bien' : 'Ni mieux ni moins';
  const en = conclusion === 'better' ? 'Better' : conclusion === 'worse' ? 'Worse' : 'Neither better nor worse';
  return {
    fr: `${fr} — ${established ? 'écart établi' : 'écart non établi'}`,
    en: `${en} — ${established ? 'established gap' : 'gap not established'}`,
  };
}

/** The gap of one cohort, in plain words. */
function cohortLine(cohort: CohortSimulation): Line {
  const fr = `${cohort.cohortKey} : ${Math.abs(cohort.delegatedDelta)} tickets délégués `
    + `${cohort.delegatedDelta >= 0 ? 'de plus' : 'de moins'}, `
    + `${Math.abs(cohort.reopeningsAvoided)} réouvertures `
    + `${cohort.reopeningsAvoided >= 0 ? 'évitées' : 'en plus'}.`;
  const en = `${cohort.cohortKey}: ${Math.abs(cohort.delegatedDelta)} `
    + `${cohort.delegatedDelta >= 0 ? 'more' : 'fewer'} tickets delegated, `
    + `${Math.abs(cohort.reopeningsAvoided)} `
    + `${cohort.reopeningsAvoided >= 0 ? 'reopenings avoided' : 'more reopenings'}.`;
  return { fr, en };
}

/* ------------------------------------------------------------------- empty */

/** The summary of a policy that had nothing to replay. */
function emptySummaryView(): SimulationSummaryView {
  return {
    label: { fr: 'Règle', en: 'Rule' },
    threshold: { fr: 'Seuil inconnu', en: 'Unknown threshold' },
    delegated: { fr: '0 ticket délégué', en: '0 tickets delegated' },
    kept: { fr: '0 ticket conservé', en: '0 tickets kept' },
    reopenings: { fr: '0 réouverture restante', en: '0 reopenings remaining' },
    cleanRate: { fr: 'Aucun taux mesuré', en: 'No rate measured' },
    medianLead: { fr: 'Aucune durée mesurée', en: 'No duration measured' },
  };
}

/** The screen without data: said out loud, never a hole (SPEC §20). */
function emptyView(): SimulationView {
  return {
    empty: true,
    title: TITLE,
    headline: { fr: 'Aucun ticket à rejouer.', en: 'No ticket to replay.' },
    baseline: emptySummaryView(),
    variant: emptySummaryView(),
    rate: { fr: 'Aucun taux mesuré', en: 'No rate measured' },
    conclusion: { fr: 'Pas assez de recul', en: 'Not enough data' },
    cohorts: [],
    note: {
      fr: "La simulation n'a rien à rejouer : aucun ticket n'a été fourni.",
      en: 'The simulation has nothing to replay: no ticket was given.',
    },
  };
}

/* ----------------------------------------------------------------- public */

/**
 * The simulation screen, ready to display.
 *
 * The viewmodel calls the domain (`simulate`, `simulateCohorts`) and formats
 * what comes back; it computes no figure of its own. Without tickets it
 * returns the explicit empty screen: no exception, no hole.
 */
export function simulationView(input: SimulationInput | null): SimulationView {
  if (input === null || input.tickets.length === 0) return emptyView();
  const outcome = simulate(input);
  const cohorts = simulateCohorts(input).map((cohort) => ({
    cohortKey: cohort.cohortKey,
    delegatedDelta: cohort.delegatedDelta,
    reopeningsAvoided: cohort.reopeningsAvoided,
    line: cohortLine(cohort),
  }));
  return {
    empty: false,
    title: TITLE,
    headline: headlineLine(input.baseline, input.variant, outcome.delta),
    baseline: summaryView(input.baseline, outcome.baseline),
    variant: summaryView(input.variant, outcome.variant),
    rate: rateLine(outcome.delta.rateDelta),
    conclusion: conclusionLine(outcome.delta.conclusion),
    cohorts,
    note: outcome.delta.note,
  };
}
