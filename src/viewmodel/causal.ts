/**
 * The causal answer of a cohort, as a screen shows it (SPEC §7 rule 5, §11
 * and §16; DP-09, DP-10, DP-17, recipe 10).
 *
 * The screen answers the director in four moves: the two groups are
 * comparable on nature, zone and size; here is the composition point where
 * they are not; with a tolerated selection gap of ×1.20 the conclusion
 * holds, beyond ×1.38 it does not; and none of this is a causal answer,
 * because nothing was drawn at random.
 *
 * The viewmodel never computes anything: the domain (`src/domain/causal.ts`)
 * owns the E-value, the confounding factor, the Rosenbaum bound and the
 * readiness, and the matching comes from `exactMatch` (`src/domain/matching.ts`).
 * This module only projects them, in the language of the interface.
 *
 * Every rate is rendered by `rateLine`, so it always carries its sample size
 * and its interval (SPEC §7 rule 3, recipe 10). No person identifier travels
 * through the projection (DP-17).
 *
 * Pure module: no `@forge/*`, no clock.
 * Rule: files < 500 lines, functions < 50 lines.
 */

import type { ProportionStat } from '../types.js';
import type { BalanceCriterion, MatchableTicket, MatchingResult } from '../domain/matching.js';
import { BALANCE_SMD_THRESHOLD, balanceBeforeAfter } from '../domain/matching.js';
import type { MatchingSensitivity } from '../domain/causal.js';
import {
  DEFAULT_SELECTION_GAMMA,
  causalReadiness,
  confoundingBound,
  confoundingFactorFor,
  matchingSensitivity,
} from '../domain/causal.js';
import type { Lang } from '../i18n/index.js';
import { createTranslator } from '../i18n/index.js';
import type { RateLine } from './common.js';
import { rateLine } from './common.js';

/** A visible sentence, in the two languages of the app (SPEC §20). */
interface Bilingual {
  readonly fr: string;
  readonly en: string;
}

/** The fixed sentences of the screen, in both languages. */
const TEXT: Readonly<Record<string, Bilingual>> = {
  title: {
    fr: "Ce que l'observation permet de dire",
    en: 'What the observation allows us to say',
  },
  intro: {
    fr: "Les deux bras n'ont pas été tirés au sort : voici ce que les données permettent de dire, et ce qu'elles ne disent pas.",
    en: 'The two arms were not drawn at random: here is what the data allows us to say, and what it does not say.',
  },
  noData: {
    fr: "Aucun ticket dans cette cohorte : il n'y a rien à comparer.",
    en: 'No ticket in this cohort: there is nothing to compare.',
  },
  comparable: {
    fr: 'comparable sur {label} (écart standardisé {value})',
    en: 'comparable on {label} (standardised difference {value})',
  },
  gap: {
    fr: '{label} : écart standardisé {value}, les deux groupes ne se ressemblent pas sur ce point',
    en: '{label}: standardised difference {value}, the two groups do not look alike on this point',
  },
  pairs: {
    fr: '{count} paires appariées sur la nature, la zone et la taille',
    en: '{count} pairs matched on nature, zone and size',
  },
  reference: {
    fr: 'Taux de référence sans agent : {value} (valeur de référence, pas une mesure)',
    en: 'Reference rate without an agent: {value} (a reference value, not a measurement)',
  },
  nullConclusion: {
    fr: "La conclusion est déjà sous le seuil : aucune confusion n'a à être invoquée.",
    en: 'The conclusion is already below the threshold: no confounding has to be invoked.',
  },
  confounding: {
    fr: "Sur l'échelle de l'écart standardisé, une confusion non mesurée de facteur ×{value} (l'écart réduit d'autant) ferait tomber la conclusion sous le seuil.",
    en: 'On the standardised-gap scale, an unmeasured confounding of factor ×{value} (the gap shrinks by as much) would bring the conclusion below the threshold.',
  },
  noPairs: {
    fr: "Aucune paire appariée : l'écart de sélection toléré n'a rien à protéger.",
    en: 'No matched pair: the tolerated selection gap has nothing to protect.',
  },
};

/** What the screen needs to know about a cohort. */
export interface CausalViewInput {
  /** The agent arm, as the matching consumes it (no person identifier). */
  readonly agent: readonly MatchableTicket[];
  /** The other arm, as the matching consumes it. */
  readonly human: readonly MatchableTicket[];
  /** Clean closure per ticket id; a ticket without an entry is not clean. */
  readonly cleanByIssueId: Readonly<Record<string, boolean>>;
  /** The rate observed with the agent, with its sample size and its interval. */
  readonly observed: ProportionStat;
  /** The rate that would be expected without the agent: the null value. */
  readonly nullValue: number;
  /** True when the two arms were drawn at random (controlled trial, SPEC §11). */
  readonly randomised?: boolean;
  /** The confounders the team knows about; everything else stays unmeasured. */
  readonly confoundersKnown?: readonly string[];
  /** The tolerated selection bias of the matching (Rosenbaum). */
  readonly gamma?: number;
}

/** The causal answer of a cohort, ready to be rendered. */
export interface CausalView {
  readonly title: string;
  readonly intro: string;
  /** The composition points on which the two groups are comparable. */
  readonly comparableLines: readonly string[];
  /** The composition points on which they are not. */
  readonly gapLines: readonly string[];
  /** The observed rate, with its sample size and its interval (recipe 10). */
  readonly observedLine: RateLine | null;
  /** The null value, said as a reference and not as a measurement. */
  readonly referenceLine: string;
  /** The E-value and what it means for the observed gap. */
  readonly eValueLine: string;
  /** The confounding level that would bring the conclusion below the threshold. */
  readonly confoundingLine: string;
  /** The Rosenbaum bound: the tolerated selection gap and its limit. */
  readonly rosenbaumLine: string;
  /** Why this observation is not a causal answer. */
  readonly readinessLine: string;
  /** False when the cohort carries too few tickets to be shown (SPEC §7 rule 2). */
  readonly usable: boolean;
  readonly noDataNotice: string | null;
  readonly anonymityNotice: string;
}

/**
 * Projects the causal answer of a cohort.
 *
 * Without data the screen renders its explicit "no ticket" line, never a zero
 * and never an exception (SPEC §20).
 */
export function causalView(input: CausalViewInput, lang: Lang): CausalView {
  const t = createTranslator(lang);
  const sensitivity = matchingSensitivity(
    input.agent,
    input.human,
    input.cleanByIssueId,
    input.gamma ?? DEFAULT_SELECTION_GAMMA,
  );
  const balance = balanceBeforeAfter(input.agent, input.human, sensitivity.matched);
  const confounding = confoundingBound(input.observed, input.nullValue);
  const factor = confoundingFactorFor(input.observed, input.nullValue);
  const readiness = causalReadiness({
    n: input.observed.n,
    randomised: input.randomised === true,
    confoundersKnown: input.confoundersKnown ?? [],
  });
  return {
    title: TEXT.title[lang],
    intro: TEXT.intro[lang],
    comparableLines: hasTickets(input)
      ? comparableLines(balance.criteria, presentCriteria(sensitivity.matched), lang)
      : [],
    gapLines: hasTickets(input) ? gapLines(balance.criteria, lang) : [],
    observedLine: input.observed.n > 0 ? rateLine(input.observed, t) : null,
    referenceLine: TEXT.reference[lang].replace('{value}', percentOf(input.nullValue)),
    eValueLine: confounding.note[lang],
    confoundingLine: confoundingLine(factor, lang),
    rosenbaumLine: rosenbaumLine(sensitivity, lang),
    readinessLine: readiness.reason[lang],
    usable: readiness.usable,
    noDataNotice: input.observed.n > 0 ? null : TEXT.noData[lang],
    anonymityNotice: t('ui.anonymity'),
  };
}

/** The composition points on which the two groups are comparable after matching. */
function comparableLines(
  criteria: readonly BalanceCriterion[],
  present: ReadonlySet<string>,
  lang: Lang,
): readonly string[] {
  return criteria
    .filter((criterion) => criterion.ok && present.has(criterion.name))
    .map((criterion) =>
      TEXT.comparable[lang]
        .replace('{label}', criterionLabel(criterion.name, lang))
        .replace('{value}', criterion.after.toFixed(2)),
    );
}

/** The composition points on which the two full arms differ before matching. */
function gapLines(criteria: readonly BalanceCriterion[], lang: Lang): readonly string[] {
  return worstPerField(criteria).map((criterion) =>
    TEXT.gap[lang]
      .replace('{label}', criterionLabel(criterion.name, lang))
      .replace('{value}', criterion.before.toFixed(2)),
  );
}

/** The worst composition difference of each field, so the screen stays readable. */
function worstPerField(criteria: readonly BalanceCriterion[]): readonly BalanceCriterion[] {
  const worst = new Map<string, BalanceCriterion>();
  for (const criterion of criteria) {
    if (Math.abs(criterion.before) < BALANCE_SMD_THRESHOLD) continue;
    const field = criterion.name.split(':')[0];
    const current = worst.get(field);
    if (current === undefined || Math.abs(criterion.before) > Math.abs(current.before)) {
      worst.set(field, criterion);
    }
  }
  return [...worst.values()];
}

/** The composition criteria the matched pairs actually carry. */
function presentCriteria(matched: MatchingResult): ReadonlySet<string> {
  const present = new Set<string>();
  for (const pair of matched.pairs) {
    for (const ticket of pair) {
      present.add(`nature:${ticket.nature}`);
      present.add(`zone:${ticket.zone}`);
      present.add(`size:${ticket.size}`);
      if (ticket.leadTimeH !== null) present.add('leadTimeH');
    }
  }
  return present;
}

/** True when the cohort carries at least one ticket on either side. */
function hasTickets(input: CausalViewInput): boolean {
  return input.agent.length + input.human.length > 0;
}

/** The sentence on the confounding level that would break the conclusion. */
function confoundingLine(factor: number, lang: Lang): string {
  if (factor <= 1) return TEXT.nullConclusion[lang];
  return TEXT.confounding[lang].replace('{value}', factor.toFixed(2));
}

/** The sentence on the tolerated selection gap and its limit. */
function rosenbaumLine(sensitivity: MatchingSensitivity, lang: Lang): string {
  if (sensitivity.matchedPairs === 0) return TEXT.noPairs[lang];
  return sensitivity.bound.note[lang];
}

/** A readable label for a composition criterion ("zone:api" → "zone api"). */
function criterionLabel(name: string, lang: Lang): string {
  const [field, value] = name.split(':');
  const labels: Readonly<Record<string, Bilingual>> = {
    nature: { fr: 'nature', en: 'nature' },
    zone: { fr: 'zone', en: 'zone' },
    size: { fr: 'taille', en: 'size' },
    leadTimeH: { fr: 'délai', en: 'delay' },
  };
  const label = labels[field] ?? { fr: field, en: field };
  return value === undefined ? label[lang] : `${label[lang]} ${value}`;
}

/** Formats the reference value as a percentage. */
function percentOf(value: number): string {
  if (!Number.isFinite(value)) return '0 %';
  const bounded = Math.min(1, Math.max(0, value));
  return `${Math.round(bounded * 100)} %`;
}
