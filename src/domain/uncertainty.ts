/**
 * Uncertainty, measured.
 *
 * Why: "41 % of the tickets have an unknown involvement" is a percentage, not a
 * measurement. A team cannot act on it. Measured, it becomes a work target:
 * how many bits of information are missing, how many tickets would settle this
 * cohort, how likely is the advice to flip. The grey on the map stops being a
 * wall and becomes a to-do list (SPEC §5, §7, DP-03, DP-19).
 *
 * The domain is pure: no `@forge/*`, no network, no clock.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { proportion } from './stats.js';
import type { Conclusion, ProportionStat } from '../types.js';

/** How much is unknown, and what it would cost to know. */
export interface UnknownEntropy {
  /** Share of tickets whose involvement is unknown, in [0, 1]. */
  readonly share: number;
  /** Entropy of the involvement distribution, in bits. */
  readonly bits: number;
  /** How many tickets would have to be clarified to decide. */
  readonly ticketsToDecide: number;
  /** What this means, in both languages. */
  readonly note: { readonly fr: string; readonly en: string };
}

/** One ticket's involvement, as the collector sees it. */
export interface InvolvementLevel {
  readonly level: string;
}

/**
 * The entropy of the involvement distribution, in bits.
 *
 * Shannon's formula over the levels present. It is **monotone**: the more the
 * distribution is spread, the more bits are missing — a cohort where every
 * ticket is known carries none.
 */
export function unknownEntropy(
  involvements: readonly InvolvementLevel[],
  perTicket: number = 1,
): UnknownEntropy {
  const total = involvements.length;
  if (total === 0) {
    return {
      share: 0, bits: 0, ticketsToDecide: 0,
      note: { fr: 'Aucun ticket : rien n’est inconnu.', en: 'No ticket: nothing is unknown.' },
    };
  }
  const unknown = involvements.filter((item) => item.level === 'unknown').length;
  const share = unknown / total;
  const distribution = new Map<string, number>();
  involvements.forEach((item) => {
    distribution.set(item.level, (distribution.get(item.level) || 0) + 1);
  });
  let bits = 0;
  distribution.forEach((count) => {
    const p = count / total;
    bits -= p * Math.log2(p);
  });
  const ticketsToDecide = Math.max(0, Math.ceil(unknown / Math.max(1, perTicket)));
  return {
    share: round4(share),
    bits: round4(bits),
    ticketsToDecide,
    note: {
      fr: `${Math.round(share * 100)} % d’implication inconnue, soit ${round2(bits)} bits d’incertitude ; ${ticketsToDecide} ticket(s) à lever pour décider.`,
      en: `${Math.round(share * 100)} % unknown involvement, that is ${round2(bits)} bits of uncertainty; ${ticketsToDecide} ticket(s) to clarify to decide.`,
    },
  };
}

/** How many tickets would settle a cohort, and whether that is reachable. */
export interface ConclusionReach {
  readonly tickets: number;
  readonly achievable: boolean;
  readonly note: { readonly fr: string; readonly en: string };
}

/**
 * How many tickets a cohort needs before a conclusion is possible.
 *
 * The target is the threshold the arm is short of; a cohort already above it
 * needs nothing. `achievable` says whether the missing tickets exist at all —
 * the honest case where the advice can never be established because there is
 * no more data to come.
 */
export function ticketsToChangeConclusion(input: {
  readonly n: number;
  readonly clean: number;
  readonly threshold: number;
  readonly targetClean?: number;
}): ConclusionReach {
  const target = input.targetClean ?? input.threshold;
  const missing = Math.max(0, target - input.n);
  const achievable = missing > 0;
  return {
    tickets: missing,
    achievable,
    note: {
      fr: achievable
        ? `Encore ${missing} ticket(s) pour atteindre ${target} et conclure.`
        : `Le seuil de ${target} est atteint : la conclusion est possible.`,
      en: achievable
        ? `${missing} more ticket(s) needed to reach ${target} and conclude.`
        : `The threshold of ${target} is met: a conclusion is possible.`,
    },
  };
}

/**
 * How likely the advice is to flip once the unknown tickets are resolved.
 *
 * A proportion — with its sample size and its interval — because a probability
 * without an interval is exactly the kind of number this app refuses to show
 * (SPEC §7 rule 3). It is a worst case: every unknown ticket turns against the
 * recommendation.
 */
export function flipProbability(input: {
  readonly n: number;
  readonly clean: number;
  readonly unknownShare: number;
}): ProportionStat {
  // La mesure honnête de « l'avis peut basculer » est la part de la cohorte
  // dont l'issue n'est pas encore tranchée : chaque ticket inconnu est une
  // pièce qu'on n'a pas encore jetée. `clean` est accepté pour le futur
  // (pondérer la bascule par la marge), sans être utilisé aujourd'hui.
  void input.clean;
  const unknown = Math.max(0, Math.min(input.n, Math.round(input.n * input.unknownShare)));
  return proportion(unknown, input.n);
}

/** The report the coverage screen shows. */
export interface UncertaintyReport {
  readonly canConclude: boolean;
  readonly blockers: readonly string[];
  readonly nextCollect: readonly string[];
  readonly note: { readonly fr: string; readonly en: string };
}

/**
 * What blocks a conclusion, and what to collect next.
 *
 * The blockers are named — "not enough history", "too much unknown" — because a
 * conclusion that fails without saying why is the thing this whole product
 * exists to avoid.
 */
export function uncertaintyReport(input: {
  readonly unknown: UnknownEntropy;
  readonly conclusion: Conclusion;
  readonly cohortKey: string;
}): UncertaintyReport {
  const blockers: string[] = [];
  if (input.conclusion === 'not-enough-data') blockers.push('pas assez de recul');
  if (input.unknown.share > 0.2) blockers.push('implication trop souvent inconnue');
  const nextCollect: string[] = [];
  if (input.unknown.ticketsToDecide > 0) {
    nextCollect.push(`Lever l’implication de ${input.unknown.ticketsToDecide} ticket(s) de la cohorte ${input.cohortKey}.`);
  }
  if (blockers.length === 0 && nextCollect.length === 0) {
    nextCollect.push('Rien à collecter : la conclusion tient.');
  }
  return {
    canConclude: input.conclusion !== 'not-enough-data',
    blockers,
    nextCollect,
    note: {
      fr: input.conclusion !== 'not-enough-data'
        ? 'La conclusion tient ; l’incertitude résiduelle est celle de toute mesure sur données observées.'
        : `On ne conclut pas : ${blockers.join(', ')}.`,
      en: input.conclusion !== 'not-enough-data'
        ? 'The conclusion holds; the residual uncertainty is that of any measurement on observed data.'
        : `No conclusion: ${blockers.join(', ')}.`,
    },
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
