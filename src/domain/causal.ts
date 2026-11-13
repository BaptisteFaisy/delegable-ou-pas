/**
 * The causal limits of an observed cohort: E-value, unmeasured confounding
 * and Rosenbaum bounds (SPEC §7 rule 5, §11 and §20; DP-09, DP-10, DP-17).
 *
 * WHY THIS MODULE EXISTS
 * Nothing in the observation of a team is random: the two arms were not
 * drawn at random. "Established gap" therefore means "compatible with the
 * data", never "produced by". This module makes that limit explicit instead
 * of leaving it implicit: it measures how much unmeasured confounding the
 * observed gap could absorb (the E-value), how much would be needed to push
 * the conclusion below the threshold, and how much selection bias a matching
 * tolerates (the Rosenbaum bound).
 *
 * WHAT THIS MODULE DOES NOT DO
 * - It never turns an observed gap into a causal claim. `causalReadiness`
 *   always answers `causal: false`, and no word of causality ever qualifies
 *   an observed gap here (SPEC §7: "established gap" is the vocabulary).
 * - It does not estimate a causal effect, and it does not replace the
 *   controlled trial (SPEC §11), the only source the app may call "proved".
 * - It does not randomise anything, does not read the clock and does not
 *   invent a missing figure: absent data stays absent.
 *
 * THE MATHEMATICS, computed on the spot, without any dependency
 * - E-value: the VanderWeele & Ding risk-ratio E-value, `RR + sqrt(RR(RR-1))`
 *   for `RR >= 1`, and the symmetric case `1/RR` for `RR < 1` (an observed
 *   rate below the null is read like the mirrored situation). It is the
 *   minimum strength of an unmeasured confounder that could explain the
 *   observed gap away.
 * - Confounding factor: the standardised gap `z = |observed - null| / se`,
 *   with `se = sqrt(null * (1 - null) / n)` (null-anchored, therefore
 *   conservative), read against the critical value of the normal law
 *   (`normalQuantile`, reused from `power.ts`). The factor is the attenuation
 *   the observed gap would have to suffer for the conclusion to fall below
 *   the threshold at level `alpha`.
 * - Rosenbaum bound: on matched pairs the exact sign test p-value is inflated
 *   by at most `gamma^m` under a selection bias of strength `gamma`; the
 *   bound is the largest `gamma` the matching tolerates at level `alpha`.
 *
 * Pure module: no `@forge/*`, no `node:fs`, no network, no clock, no
 * `Math.random()`. Deterministic: no person identifier ever travels through
 * it (DP-17).
 */

import type { ProportionStat } from '../types.js';
import type { MatchableTicket, MatchingResult } from './matching.js';
import { exactMatch } from './matching.js';
import { DEFAULT_ALPHA, normalQuantile } from './power.js';
import { DEFAULT_MIN_ARM_SIZE } from './stats.js';

/** Default tolerated selection bias of a matching (Rosenbaum): a factor of 1.2. */
export const DEFAULT_SELECTION_GAMMA: number = 1.2;

/** A visible sentence, in the two languages of the app (SPEC §20). */
export interface BilingualNote {
  readonly fr: string;
  readonly en: string;
}

/* ------------------------------------------------------------- the E-value */

/**
 * The E-value of an observed rate read against a null value.
 *
 * The E-value is the minimum strength of an unmeasured confounder that could
 * explain the observed gap away: an E-value of 1 means nothing is needed (the
 * gap is null), an E-value of 2 means a confounder twice as strong as the
 * observed association would be enough. The symmetric case is read the same
 * way: an observed rate *below* the null value is mirrored, so the E-value
 * does not depend on the direction of the gap.
 *
 * Known cases: 80 % on 50 tickets against a null value of 70 % gives
 * `RR = 1.143` and an E-value of `1.55`; 50 % against 50 % gives exactly 1;
 * a null gap gives exactly 1.
 */
export function eValue(observed: ProportionStat, nullValue: number): number {
  if (observed.n <= 0) return 1;
  const rate = clampRate(observed.rate);
  const nullRate = clampRate(nullValue);
  if (rate === nullRate) return 1;
  if (nullRate === 0) return Number.POSITIVE_INFINITY;
  return symmetricEValue(rate / nullRate);
}

/**
 * The level of unmeasured confounding that would bring the conclusion below
 * the threshold at level `alpha`.
 *
 * The observed gap is standardised: `z = |observed - null| / se`, with `se`
 * the null-anchored standard error of the observed rate. A confounder of
 * strength `gamma` shrinks the gap by `gamma`, hence shrinks `z` by `gamma`
 * too; the gap stops being established when `z` falls back to the critical
 * value of the normal law. The factor returned is therefore `z / critical`,
 * and 1 when the gap is not established to begin with: nothing has to be
 * explained away, the conclusion is already below the threshold.
 */
export function confoundingFactorFor(
  observed: ProportionStat,
  nullValue: number,
  alpha: number = DEFAULT_ALPHA,
): number {
  if (observed.n <= 0) return 1;
  const rate = clampRate(observed.rate);
  const nullRate = clampRate(nullValue);
  const gap = Math.abs(rate - nullRate);
  if (gap === 0) return 1;
  const standardError = nullStandardError(nullRate, observed.n);
  if (standardError === 0) return Number.POSITIVE_INFINITY;
  const critical = normalQuantile(1 - alpha / 2);
  const z = gap / standardError;
  if (z <= critical) return 1;
  return z / critical;
}

/** The whole confounding answer of an observed gap, in one object. */
export interface ConfoundingBound {
  readonly observed: ProportionStat;
  readonly nullValue: number;
  /** The E-value: above 1, the gap survives that level of unmeasured confounding. */
  readonly eValue: number;
  /** True when the E-value passes the `1 / alpha` bar of a robust result. */
  readonly robust: boolean;
  readonly note: BilingualNote;
}

/**
 * The confounding answer of an observed gap: the E-value, whether it reaches
 * the robustness bar (`1 / alpha`, the level under which a gap stops being
 * established), and the sentence the screen shows.
 */
export function confoundingBound(
  observed: ProportionStat,
  nullValue: number,
  alpha: number = DEFAULT_ALPHA,
): ConfoundingBound {
  const value = eValue(observed, nullValue);
  const bar = 1 / alpha;
  const robust = value > bar;
  return {
    observed,
    nullValue,
    eValue: value,
    robust,
    note: confoundingNote(value, robust, bar),
  };
}

/* -------------------------------------------------------- the Rosenbaum bound */

/**
 * The bound of Rosenbaum on a matched comparison.
 *
 * `gamma` is the tolerated selection bias (how much the matching may be
 * wrong), `bound` is the largest `gamma` the matching actually tolerates at
 * level `alpha`, and `robust` says whether the given `gamma` stays inside it.
 */
export interface RosenbaumBound {
  readonly gamma: number;
  readonly bound: number;
  readonly robust: boolean;
  readonly note: BilingualNote;
}

/**
 * The Rosenbaum bound of a matched comparison.
 *
 * `observedDifference` is the net difference of the matched pairs in favour
 * of the agent arm (pairs where it closes cleanly and the other arm does not,
 * minus the pairs where the opposite happens); the pairs where both arms
 * agree are ties and count for nothing. On those pairs the exact sign test
 * gives the observed p-value, and under a selection bias of strength `gamma`
 * that p-value can be inflated by at most `gamma^m` (`m` matched pairs). The
 * bound is the largest `gamma` for which the inflated p-value still stays
 * under `alpha`.
 */
export function rosenbaumBound(
  matchedPairs: number,
  observedDifference: number,
  gamma: number,
): RosenbaumBound {
  const pairs = Math.floor(matchedPairs);
  const net = Math.round(observedDifference);
  const tolerance = gamma >= 1 ? gamma : 1;
  if (pairs <= 0) return emptyBound(tolerance);
  if (Math.abs(net) > pairs || (pairs + net) % 2 !== 0) return inconsistentBound(tolerance);
  const decisive = (pairs + net) / 2;
  const p = signTestP(pairs, decisive);
  const bound = toleratedGamma(pairs, p);
  const robust = tolerance <= bound;
  return {
    gamma: tolerance,
    bound,
    robust,
    note: rosenbaumNote(pairs, decisive, p, bound, tolerance, robust),
  };
}

/** The Rosenbaum bound of a matching built by the exact matching. */
export interface MatchingSensitivity {
  /** The matching itself, as `exactMatch` produced it (SPEC §7 rule 5). */
  readonly matched: MatchingResult;
  readonly matchedPairs: number;
  /** Pairs where the agent arm closes cleanly and the other arm does not. */
  readonly decisiveForAgent: number;
  /** Pairs where the other arm closes cleanly and the agent arm does not. */
  readonly decisiveForHuman: number;
  /** `decisiveForAgent - decisiveForHuman`: the observed difference. */
  readonly netDifference: number;
  readonly bound: RosenbaumBound;
  readonly note: BilingualNote;
}

/**
 * Builds the exact matching (reusing `exactMatch`, never a second
 * implementation) and reads its Rosenbaum bound.
 *
 * `cleanByIssueId` carries the clean closure of each ticket, keyed by ticket
 * id: no person identifier travels through it (DP-17). A ticket without an
 * entry counts as "not cleanly closed": absent data is never invented.
 */
export function matchingSensitivity(
  agent: readonly MatchableTicket[],
  human: readonly MatchableTicket[],
  cleanByIssueId: Readonly<Record<string, boolean>>,
  gamma: number = DEFAULT_SELECTION_GAMMA,
): MatchingSensitivity {
  const matched = exactMatch(agent, human);
  let decisiveForAgent = 0;
  let decisiveForHuman = 0;
  for (const pair of matched.pairs) {
    const agentClean = cleanByIssueId[pair[0].issueId] === true;
    const humanClean = cleanByIssueId[pair[1].issueId] === true;
    if (agentClean && !humanClean) decisiveForAgent += 1;
    else if (humanClean && !agentClean) decisiveForHuman += 1;
  }
  const netDifference = decisiveForAgent - decisiveForHuman;
  const bound = rosenbaumBound(matched.pairs.length, netDifference, gamma);
  return {
    matched,
    matchedPairs: matched.pairs.length,
    decisiveForAgent,
    decisiveForHuman,
    netDifference,
    bound,
    note: matchingNote(matched.pairs.length, decisiveForAgent, decisiveForHuman, bound),
  };
}

/* --------------------------------------------------------- causal readiness */

/**
 * The readiness of an observation to be read as a causal answer. It is never
 * ready: `causal` is typed `false` on purpose, so no caller can forget it.
 */
export interface CausalReadiness {
  readonly causal: false;
  /** Why the observation is not a causal answer, in both languages. */
  readonly reason: BilingualNote;
  /** True when the observation carries enough tickets to be shown at all. */
  readonly usable: boolean;
}

/**
 * Says, always, that the observation is not a causal answer, and explains why.
 *
 * Three facts are read: the number of tickets (below the threshold of 20 the
 * app says "we do not know", SPEC §7 rule 2), whether the two arms were
 * drawn at random (only the controlled trial of SPEC §11 may be called
 * proved), and the confounders that are known (everything else stays
 * unmeasured). The word "causal" never qualifies an observed gap here.
 */
export function causalReadiness(input: {
  readonly n: number;
  readonly randomised: boolean;
  readonly confoundersKnown: readonly string[];
}): CausalReadiness {
  const usable = input.n >= DEFAULT_MIN_ARM_SIZE;
  return {
    causal: false,
    reason: readinessReason(input, usable),
    usable,
  };
}

/* --------------------------------------------------------------- internals */

/** Clamps a rate into [0, 1]; a missing figure never becomes a number. */
function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Standard error of a rate under the null: `sqrt(p0 * (1 - p0) / n)`. */
function nullStandardError(nullValue: number, n: number): number {
  if (n <= 0) return 0;
  return Math.sqrt((nullValue * (1 - nullValue)) / n);
}

/** The E-value of a risk ratio `rr >= 1`. */
function ratioEValue(rr: number): number {
  return rr + Math.sqrt(rr * (rr - 1));
}

/** The E-value of a risk ratio, read the same way on both sides of 1. */
function symmetricEValue(rr: number): number {
  return rr >= 1 ? ratioEValue(rr) : ratioEValue(1 / rr);
}

/** Formats a factor for a visible sentence ("1.55", or the infinity sign). */
function factorText(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '∞';
}

/** The sentence of a confounding answer. */
function confoundingNote(value: number, robust: boolean, bar: number): BilingualNote {
  const factor = factorText(value);
  const threshold = factorText(bar);
  if (robust) {
    return {
      fr: `Sur l'échelle des rapports de risque, l'écart observé résiste à une confusion non mesurée jusqu'à un facteur ×${factor} : il passe le seuil de robustesse ×${threshold}.`,
      en: `On the risk-ratio scale, the observed gap survives unmeasured confounding up to a factor of ×${factor}: it passes the ×${threshold} robustness bar.`,
    };
  }
  return {
    fr: `Sur l'échelle des rapports de risque, l'écart observé ne résiste qu'à une confusion non mesurée de facteur ×${factor} : il reste sous le seuil de robustesse ×${threshold}.`,
    en: `On the risk-ratio scale, the observed gap only survives unmeasured confounding up to a factor of ×${factor}: it stays under the ×${threshold} robustness bar.`,
  };
}

/** The sentence of a matching without a single pair. */
function emptyBound(gamma: number): RosenbaumBound {
  return {
    gamma,
    bound: 1,
    robust: false,
    note: {
      fr: "Aucune paire appariée : l'écart de sélection toléré n'a rien à protéger, la conclusion ne tient pas.",
      en: 'No matched pair: there is nothing for the tolerated selection gap to protect, the conclusion does not hold.',
    },
  };
}

/** The sentence of a matching whose figures do not add up. */
function inconsistentBound(gamma: number): RosenbaumBound {
  return {
    gamma,
    bound: 1,
    robust: false,
    note: {
      fr: "Le nombre de paires et l'écart observé ne concordent pas : la borne n'est pas calculable, la conclusion ne tient pas.",
      en: 'The number of pairs and the observed difference do not agree: the bound cannot be computed, the conclusion does not hold.',
    },
  };
}

/** The sentence of a Rosenbaum bound. */
function rosenbaumNote(
  pairs: number,
  decisive: number,
  p: number,
  bound: number,
  gamma: number,
  robust: boolean,
): BilingualNote {
  const limit = factorText(bound);
  const tolerated = factorText(gamma);
  const verdict = robust
    ? 'l’appariement tient'
    : 'l’appariement ne tient plus';
  const verdictEn = robust ? 'the matching holds' : 'the matching no longer holds';
  return {
    fr: `Sur ${pairs} paires appariées, ${decisive} vont dans le même sens (p-value exacte ${p.toFixed(4)}). Avec un écart de sélection toléré de ×${tolerated}, ${verdict} : la borne est ×${limit}.`,
    en: `Over ${pairs} matched pairs, ${decisive} go the same way (exact p-value ${p.toFixed(4)}). With a tolerated selection gap of ×${tolerated}, ${verdictEn}: the bound is ×${limit}.`,
  };
}

/** The sentence of a matching read with its bound. */
function matchingNote(
  pairs: number,
  decisiveForAgent: number,
  decisiveForHuman: number,
  bound: RosenbaumBound,
): BilingualNote {
  return {
    fr: `${pairs} paires appariées sur la nature, la zone et la taille ; ${decisiveForAgent} en faveur du bras agent, ${decisiveForHuman} en faveur de l'autre bras. ${bound.note.fr}`,
    en: `${pairs} pairs matched on nature, zone and size; ${decisiveForAgent} in favour of the agent arm, ${decisiveForHuman} in favour of the other arm. ${bound.note.en}`,
  };
}

/** The reason why an observation is not a causal answer, in both languages. */
function readinessReason(
  input: { readonly n: number; readonly randomised: boolean; readonly confoundersKnown: readonly string[] },
  usable: boolean,
): BilingualNote {
  const parts: string[] = [];
  const partsEn: string[] = [];
  if (!usable) {
    parts.push(`il y a moins de ${DEFAULT_MIN_ARM_SIZE} tickets : on ne sait pas encore`);
    partsEn.push(`there are fewer than ${DEFAULT_MIN_ARM_SIZE} tickets: we do not know yet`);
  }
  if (input.randomised) {
    parts.push("les deux bras ont été tirés au sort (essai contrôlé, SPEC §11), et c'est le seul cas où l'app qualifie un chiffre de prouvé ; ce module ne décrit qu'une observation");
    partsEn.push('the two arms were drawn at random (controlled trial, SPEC §11), the only case where the app calls a figure proved; this module only describes an observation');
  } else {
    parts.push("les deux bras n'ont pas été tirés au sort, donc l'écart observé reste compatible avec une explication par la composition des groupes");
    partsEn.push('the two arms were not drawn at random, so the observed gap stays compatible with an explanation coming from the group composition');
  }
  if (input.confoundersKnown.length === 0) {
    parts.push('aucun facteur de confusion n\'est renseigné : tout le reste reste non mesuré');
    partsEn.push('no confounder is listed as known: everything else stays unmeasured');
  } else {
    parts.push(`les ${input.confoundersKnown.length} facteurs de confusion connus ne couvrent pas ce qui n'a pas été mesuré`);
    partsEn.push(`the ${input.confoundersKnown.length} known confounders do not cover what was not measured`);
  }
  return {
    fr: `Une observation n'établit rien par elle-même : ${parts.join(' ; ')}.`,
    en: `An observation establishes nothing on its own: ${partsEn.join('; ')}.`,
  };
}

/* ------------------------------------------------------------- binomial tail */

/** Logarithm of the binomial probability `P(X = k)` for `X ~ Bin(m, 1/2)`. */
function logBinomialProbability(m: number, k: number): number {
  let logCombination = 0;
  for (let i = 1; i <= k; i += 1) logCombination += Math.log((m - k + i) / i);
  return logCombination - m * Math.LN2;
}

/** `P(X >= k)` for `X ~ Bin(m, 1/2)`, computed without overflow. */
function binomialUpperTail(m: number, k: number): number {
  if (k <= 0) return 1;
  if (k > m) return 0;
  let logTerm = logBinomialProbability(m, k);
  let total = 0;
  for (let i = k; i <= m; i += 1) {
    total += Math.exp(logTerm);
    if (i < m) logTerm += Math.log((m - i) / (i + 1));
  }
  return Math.min(1, total);
}

/** The exact two-sided p-value of the sign test on `m` pairs. */
function signTestP(m: number, decisiveForAgent: number): number {
  const decisiveForHuman = m - decisiveForAgent;
  const best = Math.max(decisiveForAgent, decisiveForHuman);
  return Math.min(1, 2 * binomialUpperTail(m, best));
}

/** The largest selection bias the matching tolerates at level `alpha`. */
function toleratedGamma(pairs: number, p: number): number {
  if (p <= 0) return Number.POSITIVE_INFINITY;
  if (p > DEFAULT_ALPHA) return 1;
  return (DEFAULT_ALPHA / p) ** (1 / pairs);
}
