/**
 * Naive versus honest: the comparison that shows the product in one screen.
 *
 * The pitch is "the agents close 30 % faster"; the honest answer is "they were
 * given the easy tickets". This module produces both halves at once, and it
 * refuses to let the first one travel alone: the naive aggregate carries its
 * own label (`labelled`), so no screen can display it as a plain figure, and
 * the breakdown always travels with it.
 *
 * Realises SPEC §7 rule 7 (no global figure without its breakdown), SPEC §21
 * ("total favourable, cohorts unfavourable"), SPEC §20 (a rate never alone:
 * the effectives and the intervals travel with it) and SPEC §16 (visible
 * strings in both languages). DP-08, DP-09, DP-10, DP-17.
 *
 * Nothing is recomputed here: the rates come from `stats.ts` (Wilson), the
 * gap from `difference.ts` (Newcombe), the verdict from `conclusion.ts` and
 * the composition check from `balance.ts` (zero duplication).
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock
 * (`Date.now()`), no `Math.random()`. Deterministic.
 */
import type { Balance, Conclusion, ProportionStat } from '../types.js';
import type { DifferenceStat } from './difference.js';

import { newcombeDifference } from './difference.js';
import { conclude } from './conclusion.js';
import { DEFAULT_BALANCE_TOLERANCE, compareBalance, composition } from './balance.js';
import { DEFAULT_MIN_ARM_SIZE, percent, proportion, share } from './stats.js';

/**
 * The label every naive figure carries, in both languages (SPEC §7 rule 7):
 * the type itself carries it, so a screen cannot forget it.
 */
export const NAIVE_LABEL: string = 'naive figure — chiffre naïf';

/**
 * The naive comparison of the two arms: the figure the pitch is built on, and
 * the warning that it must never be shown alone (SPEC §7 rule 7).
 */
export interface NaiveComparison {
  readonly agent: ProportionStat;
  readonly human: ProportionStat;
  readonly difference: DifferenceStat;
  readonly conclusion: Conclusion;
  /** Always names the figure as naive; never empty. */
  readonly labelled: string;
}

/** One cohort of the breakdown: the same comparison, computed inside a cohort (SPEC §7 rule 1). */
export interface CohortCell {
  readonly key: string;
  readonly agent: ProportionStat;
  readonly human: ProportionStat;
  readonly conclusion: Conclusion;
}

/** The honest side of the screen: the naive figure, its cells, and the contradiction if there is one. */
export interface HonestBreakdown {
  readonly naive: NaiveComparison;
  readonly cells: readonly CohortCell[];
  /** True when the total contradicts the majority of its own cells (Simpson's paradox). */
  readonly contradicts: boolean;
  /** The contradiction, quantified: how many cells, out of how many, go the other way. */
  readonly explanation: string;
}

/**
 * The balance the naive aggregate can actually compute: it knows two totals
 * and nothing else, so the only composition check available is the volume gap
 * (SPEC §7 rule 5). The composition of the arms is what the breakdown adds.
 */
function volumeBalance(agentTotal: number, humanTotal: number): Balance {
  return compareBalance(composition(agentTotal, {}, {}), composition(humanTotal, {}, {}));
}

/** The opposite of a decisive conclusion; `null` when the conclusion decides nothing. */
function opposite(conclusion: Conclusion): Conclusion | null {
  if (conclusion === 'better') return 'worse';
  if (conclusion === 'worse') return 'better';
  return null;
}

/** How the cohorts stand against the total (SPEC §7 rule 4). */
interface Contradiction {
  /** Cohorts that decide (better or worse). */
  readonly decisive: number;
  /** Decisive cohorts that go the other way than the total. */
  readonly other: number;
  /** Cohorts that say the two arms are equal. */
  readonly same: number;
  /** Cohorts that decide nothing (not enough data). */
  readonly grey: number;
}

/** Counts the cohorts against the total: decisive, other way, same, grey. */
function countContradiction(naive: NaiveComparison, cells: readonly CohortCell[]): Contradiction {
  const flipped = opposite(naive.conclusion);
  let decisive = 0;
  let other = 0;
  let same = 0;
  let grey = 0;
  for (const cell of cells) {
    if (cell.conclusion === 'not-enough-data') grey += 1;
    else if (cell.conclusion === 'same') same += 1;
    else {
      decisive += 1;
      if (flipped !== null && cell.conclusion === flipped) other += 1;
    }
  }
  return { decisive, other, same, grey };
}

/** True when the total goes one way and the majority of its decisive parts go the other (SPEC §7 rule 7). */
function isParadox(naive: NaiveComparison, counts: Contradiction): boolean {
  if (opposite(naive.conclusion) === null) return false;
  return counts.decisive > 0 && counts.other * 2 > counts.decisive;
}

/** Names a direction, in both languages (SPEC §16). */
function direction(conclusion: Conclusion): { readonly en: string; readonly fr: string } {
  if (conclusion === 'better') return { en: 'agents do better', fr: 'les agents font mieux' };
  if (conclusion === 'worse') return { en: 'agents do worse', fr: 'les agents font moins bien' };
  return { en: 'no direction established', fr: 'aucune direction établie' };
}

/** The quantified explanation: how many cells, out of how many, go the other way (SPEC §7 rule 7). */
function contradictionText(naive: NaiveComparison, counts: Contradiction): string {
  const flipped = opposite(naive.conclusion);
  if (flipped === null) {
    const none = `the naive total establishes no direction, so no cohort can contradict it (0 of ${counts.decisive} decisive) — le total naïf n'établit aucune direction, aucune cohorte ne peut le contredire (0 sur ${counts.decisive} décisives)`;
    return none;
  }
  const total = direction(naive.conclusion);
  const other = direction(flipped);
  const en = `${counts.other} of ${counts.decisive} decisive cohort(s) go the other way: the total says "${total.en}", ${counts.other} cohort(s) say "${other.en}" (same: ${counts.same}, grey: ${counts.grey})`;
  const fr = `${counts.other} cohortes décisives sur ${counts.decisive} vont dans l'autre sens : le total dit « ${total.fr} », ${counts.other} cohortes disent « ${other.fr} » (identiques : ${counts.same}, grises : ${counts.grey})`;
  return `${en} — ${fr}`;
}

/**
 * The naive aggregate of the two arms: the figure the pitch is built on.
 *
 * It is deliberately blind to the cohorts, which is exactly why it carries its
 * label: it must never be displayed without `honestBreakdown` next to it
 * (SPEC §7 rule 7). The verdict comes from `conclusion.ts`, so the same
 * arbitration rules apply here as everywhere else.
 */
export function naiveAggregate(
  agentClean: number,
  agentTotal: number,
  humanClean: number,
  humanTotal: number,
): NaiveComparison {
  const agent = proportion(agentClean, agentTotal);
  const human = proportion(humanClean, humanTotal);
  return {
    agent,
    human,
    difference: newcombeDifference(agent, human),
    conclusion: conclude(agent, human, DEFAULT_MIN_ARM_SIZE, volumeBalance(agentTotal, humanTotal)),
    labelled: NAIVE_LABEL,
  };
}

/**
 * The Simpson flag: does the total go one way while the cohorts go the other?
 * The detail is quantified, so a screen can show the numbers instead of a
 * verdict nobody can check (SPEC §21, "total favorable, cohorts défavorables").
 */
export function simpsonFlag(
  naive: NaiveComparison,
  cells: readonly CohortCell[],
): { readonly paradox: boolean; readonly detail: string } {
  const counts = countContradiction(naive, cells);
  return { paradox: isParadox(naive, counts), detail: contradictionText(naive, counts) };
}

/**
 * The honest side: the naive figure, its cells, and the contradiction when the
 * total contradicts its own parts. No cell is ever hidden: the breakdown adds
 * information, it never removes any (SPEC §7 rule 7).
 */
export function honestBreakdown(naive: NaiveComparison, cells: readonly CohortCell[]): HonestBreakdown {
  const flag = simpsonFlag(naive, cells);
  return { naive, cells, contradicts: flag.paradox, explanation: flag.detail };
}

/** One cohort's share of easy tickets in each arm, with the effectives behind it. */
interface BiasRow {
  readonly key: string;
  readonly agentShare: number;
  readonly humanShare: number;
  readonly gap: number;
  readonly agentN: number;
  readonly humanN: number;
}

/**
 * Reads the share of easy tickets of every cohort, in both arms. The caller
 * owns the definition of "easy": the module only compares the two arms.
 */
function biasRows(
  cells: readonly CohortCell[],
  shareByArm: (key: string) => { agent: number; human: number },
): readonly BiasRow[] {
  return cells.map((cell) => {
    const shares = shareByArm(cell.key);
    return {
      key: cell.key,
      agentShare: shares.agent,
      humanShare: shares.human,
      gap: Math.abs(shares.agent - shares.human),
      agentN: cell.agent.n,
      humanN: cell.human.n,
    };
  });
}

/** The share the whole arm really carries, weighted by its effectives (SPEC §7 rule 3). */
function armShare(rows: readonly BiasRow[], arm: 'agent' | 'human'): number {
  const weight = rows.reduce((total, row) => total + (arm === 'agent' ? row.agentN : row.humanN), 0);
  const carried = rows.reduce(
    (total, row) =>
      total + (arm === 'agent' ? row.agentShare * row.agentN : row.humanShare * row.humanN),
    0,
  );
  return share(carried, weight);
}

/** The proof of the selection bias, with its numbers (SPEC §7 rule 5). */
interface BiasSummary {
  readonly rows: readonly BiasRow[];
  readonly agentShare: number;
  readonly humanShare: number;
  readonly weightedGap: number;
  readonly aboveTolerance: readonly BiasRow[];
  readonly biased: boolean;
}

/** Weighs the evidence: the arm-wide gap, and the cohorts that go past the tolerance. */
function summariseBias(
  cells: readonly CohortCell[],
  shareByArm: (key: string) => { agent: number; human: number },
): BiasSummary {
  const rows = biasRows(cells, shareByArm);
  const agentShare = armShare(rows, 'agent');
  const humanShare = armShare(rows, 'human');
  const weightedGap = Math.abs(agentShare - humanShare);
  const aboveTolerance = rows.filter((row) => row.gap > DEFAULT_BALANCE_TOLERANCE);
  const biased = weightedGap > DEFAULT_BALANCE_TOLERANCE || aboveTolerance.length > 0;
  return { rows, agentShare, humanShare, weightedGap, aboveTolerance, biased };
}

/** Formats a gap in points: a gap is a difference, not a rate (SPEC §7 rule 3). */
function points(value: number): string {
  return `${Math.round(value * 100)} points`;
}

/** The worst cohort of the evidence, if any. */
function worstRow(rows: readonly BiasRow[]): BiasRow | null {
  return rows.reduce<BiasRow | null>(
    (worst, row) => (worst === null || row.gap > worst.gap ? row : worst),
    null,
  );
}

/** The quantified proof, in both languages (SPEC §7 rule 7, SPEC §16). */
function biasText(summary: BiasSummary): string {
  const worst = worstRow(summary.rows);
  const en = `easy-ticket share ${percent(summary.agentShare)} in the agent arm against ${percent(summary.humanShare)} in the human arm (gap ${points(summary.weightedGap)}, tolerance ${points(DEFAULT_BALANCE_TOLERANCE)}); ${summary.aboveTolerance.length} of ${summary.rows.length} cohort(s) above tolerance`;
  const fr = `part des tickets faciles : ${percent(summary.agentShare)} dans le bras agent contre ${percent(summary.humanShare)} dans le bras humain (écart ${points(summary.weightedGap)}, tolérance ${points(DEFAULT_BALANCE_TOLERANCE)}) ; ${summary.aboveTolerance.length} cohorte(s) sur ${summary.rows.length} au-delà de la tolérance`;
  if (worst === null) return `${en} — ${fr}`;
  const enWorst = `; worst cohort ${worst.key} (gap ${points(worst.gap)})`;
  const frWorst = ` ; pire cohorte ${worst.key} (écart ${points(worst.gap)})`;
  return `${en}${enWorst} — ${fr}${frWorst}`;
}

/**
 * The evidence of the selection bias: how the easy tickets were shared
 * between the two arms. This is the proof, not a hypothesis — the numbers are
 * the shares themselves, and the verdict follows the composition tolerance
 * already used everywhere else (SPEC §7 rule 5, DP-10).
 */
export function selectionBiasEvidence(
  cells: readonly CohortCell[],
  shareByArm: (key: string) => { agent: number; human: number },
): { readonly biased: boolean; readonly detail: string } {
  const summary = summariseBias(cells, shareByArm);
  return { biased: summary.biased, detail: biasText(summary) };
}
