/**
 * The simulation mode: "what if we changed the rule?" (SPEC §7, §8; DP-08,
 * DP-09, DP-12, recipe 10).
 *
 * The simulation **replays** the rule on the tickets it is given; it never
 * re-declares it. A `PolicyVariant` carries the three clauses the app applies
 * (SPEC §8 "La règle"):
 *  - `threshold`: the minimum number of tickets per arm (SPEC §7 rule 2,
 *    METHODE.md §4) — a cohort that does not reach it has not enough
 *    back-up, and keeps its tickets;
 *  - `guardrails`: the clauses that pull a ticket out of the delegation
 *    (DP-12, recipe 9) — 'incident', 'sensitive-zone', 'no-criteria', and the
 *    simulation's own 'reopened' (a ticket already reopened is not delegated
 *    again). A guardrail active in a policy removes the ticket from the
 *    delegation **in that policy, and in the other one too** when it is
 *    active there as well;
 *  - `decision`: the stance of the policy — 'delegate' and 'review' hand the
 *    eligible tickets over to the agent, 'keep' and 'always-keep' leave them
 *    to a human.
 *
 * What a summary says (the two populations of the rule):
 *  - `delegated` / `kept`: the tickets sent to the agent / left to a human;
 *  - `cleanClosed`: the clean closures of the delegated population;
 *  - `reopenings`: the reopenings that **remain**, carried by the kept
 *    population — the ones a variant removes are the "reopenings avoided";
 *  - `rate`: the clean-closure rate of the delegated population, with its
 *    sample size and its interval (SPEC §7 rule 3, recipe 10) — never a bare
 *    rate;
 *  - `medianLeadH`: the median lead time of the delegated population, `null`
 *    when the rule delegates nothing (SPEC §20: missing data is normal).
 *
 * The delta compares the two policies on the same population:
 * `delegatedDelta` (a count), `reopeningsAvoided` (a count), `rateDelta` (the
 * clean-closure rate of the simulated population, with its interval) and
 * `conclusion` (one of the four verdicts of SPEC §7 rule 4).
 *
 * What this module does NOT do:
 *  - it does not counterfactualise an outcome: a ticket's outcome is the one
 *    observed on its own arm; the simulation measures the effect of the rule
 *    on the FLOW of work, not what another arm would have done;
 *  - it does not prove anything: a simulation replays a past, it never
 *    establishes a gap (the word "prouvé" belongs to the controlled trial,
 *    SPEC §11);
 *  - it reads no graph, no database and no clock: the domain stays pure.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

import type { Balance, Conclusion, ProportionStat } from '../types.js';
import { medianOrNull, proportion } from './stats.js';
import { contentHash } from './nature.js';
import { conclude } from './conclusion.js';

/* ------------------------------------------------------------------- types */

/** A policy the simulation replays: threshold, guardrails, decision (SPEC §8). */
export interface PolicyVariant {
  readonly id: string;
  readonly label: { fr: string; en: string };
  /** Minimum number of tickets per arm before a cohort may be delegated. */
  readonly threshold: number;
  /** The guardrails that pull a ticket out of the delegation (DP-12). */
  readonly guardrails: readonly string[];
  /** The stance of the policy on the eligible tickets. */
  readonly decision: 'delegate' | 'review' | 'keep' | 'always-keep';
}

/** One ticket the simulation replays. */
export interface SimulationTicket {
  readonly issueKey: string;
  readonly cohortKey: string;
  readonly arm: 'agent' | 'human';
  readonly clean: boolean;
  readonly reopened: boolean;
  readonly leadTimeH: number;
  readonly hasIncident: boolean;
  readonly sensitive: boolean;
  readonly hasCriteria: boolean;
}

/** What a policy does with the population it is replayed on. */
export interface SimulationSummary {
  readonly delegated: number;
  readonly kept: number;
  readonly reopenings: number;
  readonly cleanClosed: number;
  readonly rate: ProportionStat;
  readonly medianLeadH: number | null;
}

/** The gap between two policies on the same population. */
export interface SimulationDelta {
  readonly delegatedDelta: number;
  readonly reopeningsAvoided: number;
  readonly rateDelta: ProportionStat;
  readonly conclusion: Conclusion;
  readonly note: { fr: string; en: string };
}

/** The outcome of a simulation: the two policies and the gap between them. */
export interface SimulationOutcome {
  readonly baseline: SimulationSummary;
  readonly variant: SimulationSummary;
  readonly delta: SimulationDelta;
}

/** The input of a simulation: the tickets to replay, and the two policies. */
export interface SimulationInput {
  readonly tickets: readonly SimulationTicket[];
  readonly baseline: PolicyVariant;
  readonly variant: PolicyVariant;
}

/** The simulation of one cohort, for the gap shown per cohort. */
export interface CohortSimulation {
  readonly cohortKey: string;
  readonly baseline: SimulationSummary;
  readonly variant: SimulationSummary;
  readonly delegatedDelta: number;
  readonly reopeningsAvoided: number;
}

/* -------------------------------------------------------------- guardrails */

/** An open incident pulls the ticket out of the delegation (SPEC §8). */
export const GUARDRAIL_INCIDENT = 'incident';
/** A sensitive zone pulls the ticket out of the delegation (SPEC §8). */
export const GUARDRAIL_SENSITIVE = 'sensitive-zone';
/** Missing acceptance criteria pull the ticket out (SPEC §8). */
export const GUARDRAIL_NO_CRITERIA = 'no-criteria';
/** A ticket already reopened is not delegated again (simulation only). */
export const GUARDRAIL_REOPENED = 'reopened';

/** The three guardrails of SPEC §8, in the order of the SPEC. */
const DEFAULT_GUARDRAILS: readonly string[] = [
  GUARDRAIL_INCIDENT,
  GUARDRAIL_SENSITIVE,
  GUARDRAIL_NO_CRITERIA,
];

/** The rule the app applies today (SPEC §8 "La règle", METHODE.md §4). */
const CURRENT_POLICY: PolicyVariant = {
  id: 'current',
  label: { fr: 'Règle actuelle', en: 'Current rule' },
  threshold: 20,
  guardrails: DEFAULT_GUARDRAILS,
  decision: 'delegate',
};

/**
 * The two populations of a simulation are the same tickets seen through two
 * rules: their composition does not change, so no arm is unbalanced here.
 */
const BALANCED: Balance = { balanced: true, signals: [] };

/* ------------------------------------------------------------------ replay */

/** The number of tickets of one cohort, per arm (SPEC §7 rule 2). */
interface ArmCounts {
  readonly agent: number;
  readonly human: number;
}

/** Counts the tickets per arm, per cohort. */
function countsByCohort(tickets: readonly SimulationTicket[]): Map<string, ArmCounts> {
  const counts = new Map<string, { agent: number; human: number }>();
  for (const ticket of tickets) {
    const current = counts.get(ticket.cohortKey) ?? { agent: 0, human: 0 };
    const next = ticket.arm === 'agent'
      ? { agent: current.agent + 1, human: current.human }
      : { agent: current.agent, human: current.human + 1 };
    counts.set(ticket.cohortKey, next);
  }
  return counts;
}

/** True when the cohort reaches the threshold in both arms (SPEC §7 rule 2). */
function eligible(counts: ArmCounts | undefined, threshold: number): boolean {
  if (counts === undefined) return false;
  return counts.agent >= threshold && counts.human >= threshold;
}

/** True when a guardrail of the policy pulls the ticket out of the delegation. */
function firesGuardrail(ticket: SimulationTicket, guardrails: readonly string[]): boolean {
  if (guardrails.includes(GUARDRAIL_INCIDENT) && ticket.hasIncident) return true;
  if (guardrails.includes(GUARDRAIL_SENSITIVE) && ticket.sensitive) return true;
  if (guardrails.includes(GUARDRAIL_NO_CRITERIA) && !ticket.hasCriteria) return true;
  if (guardrails.includes(GUARDRAIL_REOPENED) && ticket.reopened) return true;
  return false;
}

/** True when the policy hands the eligible tickets over to the agent. */
function delegates(policy: PolicyVariant, isEligible: boolean): boolean {
  if (policy.decision === 'keep' || policy.decision === 'always-keep') return false;
  return isEligible;
}

/** The counts of one replay: the two populations and what came out of them. */
interface Tally {
  delegated: number;
  kept: number;
  cleanClosed: number;
  reopenings: number;
  leadTimes: number[];
}

/** Replays one policy on the tickets: who works, and what came out of it. */
function replay(
  tickets: readonly SimulationTicket[],
  policy: PolicyVariant,
  counts: Map<string, ArmCounts>,
): Tally {
  const tally: Tally = { delegated: 0, kept: 0, cleanClosed: 0, reopenings: 0, leadTimes: [] };
  for (const ticket of tickets) {
    const isEligible = eligible(counts.get(ticket.cohortKey), policy.threshold);
    const guarded = firesGuardrail(ticket, policy.guardrails);
    if (!guarded && delegates(policy, isEligible)) {
      tally.delegated += 1;
      if (ticket.clean) tally.cleanClosed += 1;
      tally.leadTimes.push(ticket.leadTimeH);
    } else {
      tally.kept += 1;
      if (ticket.reopened) tally.reopenings += 1;
    }
  }
  return tally;
}

/** The summary of a replay: the two populations, with the honest rate. */
function summarize(tally: Tally): SimulationSummary {
  return {
    delegated: tally.delegated,
    kept: tally.kept,
    reopenings: tally.reopenings,
    cleanClosed: tally.cleanClosed,
    rate: proportion(tally.cleanClosed, tally.delegated),
    medianLeadH: medianOrNull(tally.leadTimes),
  };
}

/** Groups the tickets by cohort, in the order they appear. */
function groupByCohort(tickets: readonly SimulationTicket[]): Map<string, SimulationTicket[]> {
  const groups = new Map<string, SimulationTicket[]>();
  for (const ticket of tickets) {
    const group = groups.get(ticket.cohortKey);
    if (group === undefined) groups.set(ticket.cohortKey, [ticket]);
    else group.push(ticket);
  }
  return groups;
}

/* ------------------------------------------------------------------- delta */

/** The note of the delta: what changed, in French and in English. */
function noteOf(
  baseline: PolicyVariant,
  variant: PolicyVariant,
  delegatedDelta: number,
  reopeningsAvoided: number,
): { fr: string; en: string } {
  const fr = `Seuil ${baseline.threshold} → ${variant.threshold} : `
    + `${Math.abs(delegatedDelta)} tickets délégués `
    + `${delegatedDelta >= 0 ? 'de plus' : 'de moins'}, `
    + `${Math.abs(reopeningsAvoided)} réouvertures `
    + `${reopeningsAvoided >= 0 ? 'évitées' : 'en plus'}.`;
  const en = `Threshold ${baseline.threshold} → ${variant.threshold}: `
    + `${Math.abs(delegatedDelta)} ${delegatedDelta >= 0 ? 'more' : 'fewer'} tickets delegated, `
    + `${Math.abs(reopeningsAvoided)} ${reopeningsAvoided >= 0 ? 'reopenings avoided' : 'more reopenings'}.`;
  return { fr, en };
}

/** The gap between the two policies, with the verdict of SPEC §7 rule 4. */
function deltaOf(
  baselinePolicy: PolicyVariant,
  variantPolicy: PolicyVariant,
  baseline: SimulationSummary,
  variant: SimulationSummary,
): SimulationDelta {
  const delegatedDelta = variant.delegated - baseline.delegated;
  const reopeningsAvoided = baseline.reopenings - variant.reopenings;
  const minArmSize = Math.max(baselinePolicy.threshold, variantPolicy.threshold);
  return {
    delegatedDelta,
    reopeningsAvoided,
    rateDelta: variant.rate,
    conclusion: conclude(variant.rate, baseline.rate, minArmSize, BALANCED),
    note: noteOf(baselinePolicy, variantPolicy, delegatedDelta, reopeningsAvoided),
  };
}

/* ------------------------------------------------------------------ public */

/**
 * The four policies the simulation screen offers: the current rule, a more
 * tolerant one, a stricter one, and one with an extra guardrail.
 */
export function defaultVariants(): readonly PolicyVariant[] {
  return [
    CURRENT_POLICY,
    {
      id: 'lenient',
      label: { fr: 'Plus tolérante (seuil 15)', en: 'More tolerant (threshold 15)' },
      threshold: 15,
      guardrails: DEFAULT_GUARDRAILS,
      decision: 'delegate',
    },
    {
      id: 'strict',
      label: { fr: 'Plus stricte (seuil 30, relecture renforcée)', en: 'Stricter (threshold 30, review)' },
      threshold: 30,
      guardrails: DEFAULT_GUARDRAILS,
      decision: 'review',
    },
    {
      id: 'guarded',
      label: { fr: 'Garde-fou supplémentaire (pas de redélégation)', en: 'Extra guardrail (no re-delegation)' },
      threshold: 20,
      guardrails: [...DEFAULT_GUARDRAILS, GUARDRAIL_REOPENED],
      decision: 'delegate',
    },
  ];
}

/**
 * Replays the two policies on the tickets and returns the gap between them.
 *
 * The tickets are the work that came in: the rule is applied to all of them,
 * exactly as it would be applied to new tickets.
 */
export function simulate(input: SimulationInput): SimulationOutcome {
  const counts = countsByCohort(input.tickets);
  const baseline = summarize(replay(input.tickets, input.baseline, counts));
  const variant = summarize(replay(input.tickets, input.variant, counts));
  return {
    baseline,
    variant,
    delta: deltaOf(input.baseline, input.variant, baseline, variant),
  };
}

/** The same simulation, cohort by cohort, for the gaps shown per cohort. */
export function simulateCohorts(input: SimulationInput): readonly CohortSimulation[] {
  const cohorts: CohortSimulation[] = [];
  for (const [cohortKey, tickets] of groupByCohort(input.tickets)) {
    const counts = countsByCohort(tickets);
    const baseline = summarize(replay(tickets, input.baseline, counts));
    const variant = summarize(replay(tickets, input.variant, counts));
    cohorts.push({
      cohortKey,
      baseline,
      variant,
      delegatedDelta: variant.delegated - baseline.delegated,
      reopeningsAvoided: baseline.reopenings - variant.reopenings,
    });
  }
  return cohorts;
}

/**
 * The sweep: the same tickets replayed against the current rule, once per
 * threshold asked for.
 */
export function simulateThresholds(
  tickets: readonly SimulationTicket[],
  thresholds: readonly number[],
): readonly SimulationOutcome[] {
  return thresholds.map((threshold) => simulate({
    tickets,
    baseline: CURRENT_POLICY,
    variant: { ...CURRENT_POLICY, id: `threshold-${threshold}`, threshold },
  }));
}

/**
 * The version of a policy: a stable fingerprint of the rule.
 *
 * The same policy always gives the same string, and a different rule always
 * gives a different one. The fingerprint covers the policy's name and its
 * clauses — the threshold, the guardrails (a set: their order is not part of
 * the rule) and the decision — but not its display label, so a translation
 * never changes the rule's version.
 */
export function policyVersion(variant: PolicyVariant): string {
  const canonical = JSON.stringify({
    id: variant.id,
    threshold: variant.threshold,
    guardrails: [...variant.guardrails].sort(),
    decision: variant.decision,
  });
  return contentHash(canonical);
}
