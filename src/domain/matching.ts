/**
 * One-to-one matching between the "with agent" and the "without agent" arms.
 *
 * Unbalanced arms are a dead end today (SPEC §7 rule 5: the app says so and
 * renounces). On real teams the arms are almost always unbalanced, so this
 * module turns part of those "we don't know" cases into honest conclusions:
 * exact matching on nature × zone × size first, nearest neighbour on a
 * propensity score as a fallback (without replacement, tunable caliper), the
 * matched share and the discarded tickets always reported, and a standardised
 * balance report before/after matching.
 *
 * This module never concludes: it yields pairs, and `cohort.ts` /
 * `difference.ts` conclude. Realises SPEC §7 rule 5 (idea 5: matching) and
 * respects DP-17 (no person identifier in the inputs nor in any output).
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock, no
 * `Math.random()`. Determinism: stable sorts, every tie broken by `issueId`.
 */

import type { Arm, Nature, Size } from '../types.js';
import { share } from './stats.js';

/**
 * A ticket that can enter a matching. DP-17: it carries no person identifier,
 * only the ticket id and the cohort coordinates. `leadTimeH` is `null` when
 * the ticket is still open or its duration is unknown (absent data stays
 * absent, never invented).
 */
export interface MatchableTicket {
  readonly issueId: string;
  readonly arm: Arm;
  readonly nature: Nature;
  readonly zone: string;
  readonly size: Size;
  readonly leadTimeH: number | null;
}

/** One matched pair: the agent-arm ticket first, the human-arm ticket second. */
export type TicketPair = readonly [MatchableTicket, MatchableTicket];

/**
 * What a matching yields: the pairs, what was discarded on each side (a
 * matching that throws away most of the tickets is not an answer, and the
 * app must be able to say so through `matchedShare` and the unmatched
 * lists), and the criteria the matching ran on (DP-17: these keys are
 * scannable for person identifiers).
 */
export interface MatchingResult {
  readonly pairs: readonly TicketPair[];
  readonly unmatchedAgent: readonly MatchableTicket[];
  readonly unmatchedHuman: readonly MatchableTicket[];
  readonly matchedShare: number;
  readonly keys: readonly string[];
}

/** Exact matching runs on nature × zone × size by default (SPEC §7 rule 5). */
export const DEFAULT_EXACT_KEYS: readonly string[] = ['nature', 'zone', 'size'];

/** Default caliper of the nearest-neighbour fallback, on the propensity scale. */
export const DEFAULT_CALIPER: number = 0.2;

/** A standardised difference below this threshold counts as balanced. */
export const BALANCE_SMD_THRESHOLD: number = 0.1;

/** Readable value of one ticket feature; `null` when absent or unknown. */
const FEATURE_VALUES: Readonly<Record<string, (ticket: MatchableTicket) => string | number | null>> = {
  issueId: (ticket) => ticket.issueId,
  arm: (ticket) => ticket.arm,
  nature: (ticket) => ticket.nature,
  zone: (ticket) => ticket.zone,
  size: (ticket) => ticket.size,
  leadTimeH: (ticket) => ticket.leadTimeH,
};

/** Value of one feature of one ticket; `null` when the feature is unknown. */
export function featureValue(ticket: MatchableTicket, feature: string): string | number | null {
  const read = FEATURE_VALUES[feature];
  return read === undefined ? null : read(ticket);
}

/** Matching key of one ticket for the given features ("bug|api|M"). */
function keyOf(ticket: MatchableTicket, keys: readonly string[]): string {
  return keys.map((key) => String(featureValue(ticket, key) ?? 'unknown')).join('|');
}

/** Copies a list sorted by `issueId`: the determinism of every tie-break. */
function byIssueId(tickets: readonly MatchableTicket[]): MatchableTicket[] {
  return [...tickets].sort((a, b) => (a.issueId < b.issueId ? -1 : a.issueId > b.issueId ? 1 : 0));
}

/** Assembles a matching result; `total` is the number of tickets offered. */
function buildResult(
  pairs: readonly TicketPair[],
  unmatchedAgent: readonly MatchableTicket[],
  unmatchedHuman: readonly MatchableTicket[],
  total: number,
  keys: readonly string[],
): MatchingResult {
  return {
    pairs,
    unmatchedAgent: byIssueId(unmatchedAgent),
    unmatchedHuman: byIssueId(unmatchedHuman),
    matchedShare: share(pairs.length * 2, total),
    keys: [...keys],
  };
}

/**
 * Exact 1-to-1 matching on `nature × zone × size` (or on the given feature
 * keys), without replacement. Tickets are consumed in `issueId` order, so the
 * result never depends on the input order.
 */
export function exactMatch(
  agent: readonly MatchableTicket[],
  human: readonly MatchableTicket[],
  keys: readonly string[] = DEFAULT_EXACT_KEYS,
): MatchingResult {
  const pool = new Map<string, MatchableTicket[]>();
  for (const ticket of byIssueId(human)) {
    const key = keyOf(ticket, keys);
    const bucket = pool.get(key);
    if (bucket === undefined) pool.set(key, [ticket]);
    else bucket.push(ticket);
  }
  const pairs: TicketPair[] = [];
  const unmatchedAgent: MatchableTicket[] = [];
  for (const ticket of byIssueId(agent)) {
    const partner = pool.get(keyOf(ticket, keys))?.shift();
    if (partner === undefined) unmatchedAgent.push(ticket);
    else pairs.push([ticket, partner]);
  }
  const unmatchedHuman: MatchableTicket[] = [];
  for (const bucket of pool.values()) unmatchedHuman.push(...bucket);
  return buildResult(pairs, unmatchedAgent, unmatchedHuman, agent.length + human.length, keys);
}

/**
 * One term of a propensity score: a named numeric view of a ticket, weighted.
 * The `value` functions are expected to map onto a comparable scale (typically
 * [0, 1]) so that `DEFAULT_CALIPER` means something.
 */
export interface PropensityWeight {
  readonly feature: string;
  readonly value: (ticket: MatchableTicket) => number;
  readonly weight: number;
}

/** Propensity score of one ticket: the weighted sum of its feature values. */
export function propensityScore(
  ticket: MatchableTicket,
  weights: readonly PropensityWeight[],
): number {
  let score = 0;
  for (const term of weights) score += term.weight * term.value(ticket);
  return score;
}

/** Lead time softly scaled onto [0, 1): 24 h maps to 0.5; absent stays mid-scale. */
function scaledLeadTime(ticket: MatchableTicket): number {
  if (ticket.leadTimeH === null) return 0.5;
  const hours = Math.max(0, ticket.leadTimeH);
  return hours / (hours + 24);
}

/**
 * Default propensity weights when the caller brings none: the scaled lead
 * time alone. Callers with richer features pass their own weights.
 */
export const DEFAULT_PROPENSITY_WEIGHTS: readonly PropensityWeight[] = [
  { feature: 'leadTimeH', value: scaledLeadTime, weight: 1 },
];

/** One human-arm candidate of the nearest-neighbour search. */
interface Candidate {
  readonly ticket: MatchableTicket;
  readonly score: number;
  used: boolean;
}

/**
 * Nearest-neighbour matching on the propensity score, without replacement and
 * within a caliper (default 0.2). Agent tickets are served in `issueId`
 * order; among equidistant candidates the smallest `issueId` wins, so the
 * result is fully deterministic.
 */
export function nearestNeighbourMatch(
  agent: readonly MatchableTicket[],
  human: readonly MatchableTicket[],
  options: { caliper?: number; weights?: readonly PropensityWeight[] },
): MatchingResult {
  const caliper = options.caliper ?? DEFAULT_CALIPER;
  const weights = options.weights ?? DEFAULT_PROPENSITY_WEIGHTS;
  const candidates: Candidate[] = byIssueId(human).map((ticket) => ({
    ticket,
    score: propensityScore(ticket, weights),
    used: false,
  }));
  const pairs: TicketPair[] = [];
  const unmatchedAgent: MatchableTicket[] = [];
  for (const ticket of byIssueId(agent)) {
    const best = closestCandidate(ticket, candidates, caliper, weights);
    if (best === null) unmatchedAgent.push(ticket);
    else {
      best.used = true;
      pairs.push([ticket, best.ticket]);
    }
  }
  const unmatchedHuman = candidates.filter((candidate) => !candidate.used).map((c) => c.ticket);
  const keys = weights.map((term) => term.feature);
  return buildResult(pairs, unmatchedAgent, unmatchedHuman, agent.length + human.length, keys);
}

/** Closest free candidate within the caliper, ties broken by input order (issueId). */
function closestCandidate(
  ticket: MatchableTicket,
  candidates: readonly Candidate[],
  caliper: number,
  weights: readonly PropensityWeight[],
): Candidate | null {
  const score = propensityScore(ticket, weights);
  let best: Candidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.used) continue;
    const distance = Math.abs(candidate.score - score);
    if (distance <= caliper && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** A numeric view of a ticket used by the balance report; `null` = absent. */
interface NumericView {
  readonly name: string;
  readonly value: (ticket: MatchableTicket) => number | null;
}

/** Categorical fields turned into 0/1 indicators for the balance report. */
const INDICATOR_FIELDS: readonly ('nature' | 'zone' | 'size')[] = ['nature', 'zone', 'size'];

/** Indicator view: 1 when the ticket carries `wanted` in `field`, else 0. */
function indicatorView(field: 'nature' | 'zone' | 'size', wanted: string): NumericView {
  return { name: `${field}:${wanted}`, value: (ticket) => (ticket[field] === wanted ? 1 : 0) };
}

/** Every criterion of the balance report: lead time + one indicator per category. */
function criteriaViews(tickets: readonly MatchableTicket[]): readonly NumericView[] {
  const views: NumericView[] = [{ name: 'leadTimeH', value: (ticket) => ticket.leadTimeH }];
  for (const field of INDICATOR_FIELDS) {
    const distinct = [...new Set(tickets.map((ticket) => ticket[field]))].sort();
    for (const value of distinct) views.push(indicatorView(field, value));
  }
  return views;
}

/** Numeric values of one view over a list of tickets; absent values are dropped. */
function valuesOf(tickets: readonly MatchableTicket[], view: NumericView): number[] {
  const values: number[] = [];
  for (const ticket of tickets) {
    const value = view.value(ticket);
    if (value !== null) values.push(value);
  }
  return values;
}

/** Arithmetic mean; 0 on an empty list (callers guard empties themselves). */
function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Population variance; 0 on an empty list. */
function populationVariance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const centre = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - centre) * (value - centre);
  return sum / values.length;
}

/**
 * Standardised mean difference (difference of means over the pooled standard
 * deviation), signed. 0 when one side is empty; +∞ when both sides are
 * constant but different (nothing rescales a gap that has no spread).
 */
function standardizedDifference(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const pooled = Math.sqrt((populationVariance(a) + populationVariance(b)) / 2);
  if (pooled === 0) return mean(a) === mean(b) ? 0 : Number.POSITIVE_INFINITY;
  return (mean(a) - mean(b)) / pooled;
}

/** One criterion of the balance report, measured before and after matching. */
export interface BalanceCriterion {
  readonly name: string;
  readonly before: number;
  readonly after: number;
  readonly ok: boolean;
}

/** The whole balance report: balanced when every criterion passes under 0.1. */
export interface BalanceReport {
  readonly balanced: boolean;
  readonly criteria: readonly BalanceCriterion[];
}

/**
 * Standardised difference of every criterion before matching (full arms) and
 * after matching (paired tickets only). `balanced` is true when every
 * criterion stays under `BALANCE_SMD_THRESHOLD` after matching — the usual
 * admission rule of matched comparisons.
 */
export function balanceBeforeAfter(
  agent: readonly MatchableTicket[],
  human: readonly MatchableTicket[],
  matched: MatchingResult,
): BalanceReport {
  const views = criteriaViews([...agent, ...human]);
  const matchedAgent = matched.pairs.map((pair) => pair[0]);
  const matchedHuman = matched.pairs.map((pair) => pair[1]);
  const criteria: BalanceCriterion[] = views.map((view) => {
    const after = standardizedDifference(
      valuesOf(matchedAgent, view),
      valuesOf(matchedHuman, view),
    );
    return {
      name: view.name,
      before: standardizedDifference(valuesOf(agent, view), valuesOf(human, view)),
      after,
      ok: Math.abs(after) < BALANCE_SMD_THRESHOLD,
    };
  });
  return { balanced: criteria.every((criterion) => criterion.ok), criteria };
}
