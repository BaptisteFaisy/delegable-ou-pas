/**
 * The data preparation shared by the ten feature panels of the public site
 * (lot E11b): the projections of the sample dataset into the inputs the real
 * domain modules read.
 *
 * Nothing here computes a figure: every function shapes the sample data for
 * `src/domain/**`, which does the maths. The panels therefore show the app's
 * own numbers, never a second implementation (SPEC §7, §24, DP-20).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { compareBalance, composition } from '../../src/domain/balance.js';
import { conclude } from '../../src/domain/conclusion.js';
import { guardrails, recommendFrom } from '../../src/domain/recommendation.js';
import type { NightCandidate, NightOutcome } from '../../src/domain/coordinator.js';
import type { FreshnessContract } from '../../src/domain/freshness.js';
import type { MatchableTicket } from '../../src/domain/matching.js';
import { empiricalPrior } from '../../src/domain/pooling.js';
import type { PoolingInput } from '../../src/domain/pooling.js';
import { defaultVariants } from '../../src/domain/simulation.js';
import type { PolicyVariant, SimulationTicket } from '../../src/domain/simulation.js';
import { extractFeatures, scoreInvolvement } from '../../src/domain/signals.js';
import type { LabelledExample, SignalCommit } from '../../src/domain/signals.js';
import { DEFAULT_MIN_ARM_SIZE, medianOrNull, proportion } from '../../src/domain/stats.js';
import {
  sampleCommitFacts, sampleInvolvements, sampleOutcomes, sampleReviewFacts, sampleSettings,
} from '../../src/sample/index.js';
import type { Arm, Balance, ProportionStat } from '../../src/types.js';
import type { Recommendation } from '../../src/types-advice.js';
import { armTotals, cohortKeyOf, cohortKeys } from './panneaux-stats.js';
import type { ArmTotals, SiteTicket } from './site-types.js';

/* ------------------------------------------------------------- the cohorts */

/** The rule the app applies today: the first policy of the simulation. */
export function currentPolicy(): PolicyVariant {
  return defaultVariants()[0];
}

/** The biggest cohort that may be compared, so a panel never shows a thin one. */
export function biggestCohort(totals: readonly ArmTotals[]): ArmTotals {
  const usable = totals.find((item) => item.agent.total >= DEFAULT_MIN_ARM_SIZE
    && item.human.total >= DEFAULT_MIN_ARM_SIZE);
  const fallback = usable ?? totals[0];
  if (!fallback) throw new Error('no cohort in the sample dataset');
  return fallback;
}

/** The two arms of one cohort, as proportions with their sample size. */
export function armsOf(tickets: readonly SiteTicket[], key: string): { agent: ProportionStat; human: ProportionStat } {
  const totals = armTotals(tickets, key);
  return {
    agent: proportion(totals.agent.clean, totals.agent.total),
    human: proportion(totals.human.clean, totals.human.total),
  };
}

/** Counts per category, for the balance comparison of the two arms. */
function countBy(tickets: readonly SiteTicket[], key: (ticket: SiteTicket) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  tickets.forEach((ticket) => {
    const label = key(ticket);
    counts[label] = (counts[label] || 0) + 1;
  });
  return counts;
}

/** The composition verdict of the two arms of one cohort (SPEC §7 rule 5). */
export function balanceOf(tickets: readonly SiteTicket[], key: string): Balance {
  const inCohort = tickets.filter((ticket) => cohortKeyOf(ticket) === key);
  const of = (arm: Arm) => {
    const armTickets = inCohort.filter((ticket) => ticket.arm === arm);
    return composition(
      armTickets.length,
      countBy(armTickets, (ticket) => ticket.size),
      countBy(armTickets, (ticket) => ticket.nature),
    );
  };
  return compareBalance(of('agent'), of('human'));
}

/** How many tickets of one cohort were reopened (the rework the agent caused). */
export function reopenedIn(tickets: readonly SiteTicket[], key: string): number {
  return tickets.filter((ticket) => cohortKeyOf(ticket) === key && ticket.reopened).length;
}

/* ------------------------------------------------------------ the matching */

/** The tickets of one arm, shaped the way the matcher reads them. */
export function matchable(tickets: readonly SiteTicket[], arm: Arm): readonly MatchableTicket[] {
  return tickets
    .filter((ticket) => ticket.arm === arm)
    .map((ticket) => ({
      issueId: ticket.issueId,
      arm,
      nature: ticket.nature,
      zone: ticket.zone,
      size: ticket.size,
      leadTimeH: ticket.closedAt === '' ? null : ticket.leadTimeH,
    }));
}

/** The clean closure of every ticket, keyed by ticket id (DP-17). */
export function cleanByIssue(tickets: readonly SiteTicket[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  tickets.forEach((ticket) => { out[ticket.issueId] = ticket.clean; });
  return out;
}

/* ---------------------------------------------------------- the simulation */

/**
 * The tickets, replayed by the simulation.
 *
 * The sample dataset carries no acceptance criteria, so the "no criteria"
 * guardrail is not exercised: the panel says so rather than pretending.
 */
export function simulationTickets(tickets: readonly SiteTicket[]): readonly SimulationTicket[] {
  const incidents = new Map(sampleOutcomes().map((outcome) => [outcome.issueId, outcome.incidents > 0]));
  const sensitive = new Set(sampleSettings().sensitiveZones);
  return tickets
    .filter((ticket) => ticket.arm !== null)
    .map((ticket) => ({
      issueKey: ticket.issueId,
      cohortKey: cohortKeyOf(ticket),
      arm: ticket.arm === 'human' ? 'human' : 'agent',
      clean: ticket.clean,
      reopened: ticket.reopened,
      leadTimeH: ticket.leadTimeH,
      hasIncident: incidents.get(ticket.issueId) === true,
      sensitive: sensitive.has(ticket.zone),
      hasCriteria: true,
    }));
}

/* -------------------------------------------------------------- the pooling */

/** One pooling input per cohort: its own rate, and the prior of its nature. */
export function poolingInputs(tickets: readonly SiteTicket[]): readonly PoolingInput[] {
  const groups = cohortKeys(tickets, 12).map((key) => {
    const inCohort = tickets.filter((ticket) => cohortKeyOf(ticket) === key);
    return {
      key,
      nature: inCohort.length > 0 ? inCohort[0].nature : '',
      clean: inCohort.filter((ticket) => ticket.clean).length,
      total: inCohort.length,
    };
  });
  return groups.map((group) => {
    const siblings = groups
      .filter((other) => other.nature === group.nature && other.key !== group.key)
      .map((other) => ({ clean: other.clean, total: other.total }));
    return {
      cohortKey: group.key,
      own: proportion(group.clean, group.total),
      prior: empiricalPrior(siblings),
    };
  });
}

/* -------------------------------------------------------------- the signals */

/** The commits of every ticket, grouped by ticket id. */
export function commitsByIssue(): Map<string, SignalCommit[]> {
  const grouped = new Map<string, SignalCommit[]>();
  sampleCommitFacts().forEach((fact) => {
    const list = grouped.get(fact.issueId) ?? [];
    list.push({
      filesTouched: 0,
      linesChanged: 0,
      authorIsBot: fact.authorIsBot,
      hasSignature: fact.hasSignature,
      committedAt: fact.committedAt,
    });
    grouped.set(fact.issueId, list);
  });
  return grouped;
}

/**
 * The labelled tickets: their signals, and whether an agent really worked on
 * them. The sample dataset carries no diff size, so the "diff size" signal
 * never fires on it — the panel says so instead of hiding the gap.
 */
export function labelledExamples(): readonly LabelledExample[] {
  const levelByIssue = new Map(sampleInvolvements().map((item) => [item.issueId, item.level]));
  const examples: LabelledExample[] = [];
  commitsByIssue().forEach((commits, issueId) => {
    const level = levelByIssue.get(issueId);
    if (level === undefined || level === 'unknown') return;
    examples.push({ features: extractFeatures(commits), labelledAgent: level !== 'none' });
  });
  return examples;
}

/** The tickets whose involvement is unknown: the collection candidates. */
export function unknownCandidates(tickets: readonly SiteTicket[]): readonly { issueKey: string; cohortKey: string }[] {
  return tickets
    .filter((ticket) => ticket.arm === null)
    .map((ticket) => ({ issueKey: ticket.issueId, cohortKey: cohortKeyOf(ticket) }));
}

/** How many tickets each cohort holds, for the expected gain of a collection. */
export function cohortSizes(tickets: readonly SiteTicket[]): Record<string, number> {
  return countBy(tickets, (ticket) => cohortKeyOf(ticket));
}

/** The involvement score of every ticket, from its own commits. */
export function scoresOf(tickets: readonly SiteTicket[]): Record<string, number> {
  const grouped = commitsByIssue();
  const out: Record<string, number> = {};
  tickets.forEach((ticket) => {
    const commits = grouped.get(ticket.issueId);
    if (!commits || commits.length === 0) return;
    out[ticket.issueId] = scoreInvolvement(extractFeatures(commits)).score;
  });
  return out;
}

/* -------------------------------------------------------- the coordinator */

/**
 * The candidates of the night, one per ticket.
 *
 * The sample dataset carries no acceptance criteria and no collision map, so
 * those two flags stay permissive; the other ones come from the data.
 */
export function nightCandidates(tickets: readonly SiteTicket[]): readonly NightCandidate[] {
  const settings = sampleSettings();
  const sensitive = new Set(settings.sensitiveZones);
  const incidents = new Map(sampleOutcomes().map((outcome) => [outcome.issueId, outcome.incidents > 0]));
  const reviewed = new Set(sampleReviewFacts().map((fact) => fact.issueId));
  const estimates = estimateMinutes(tickets);
  const recommendations = recommendationByCohort(tickets);
  return tickets.map((ticket) => ({
    issueKey: ticket.issueId,
    cohortKey: cohortKeyOf(ticket),
    recommendation: recommendations.get(cohortKeyOf(ticket)) ?? 'not-enough-data',
    ready: ticket.closedAt !== '',
    urgent: incidents.get(ticket.issueId) === true,
    sensitive: sensitive.has(ticket.zone),
    hasCriteria: true,
    reviewable: reviewed.has(ticket.issueId),
    collision: false,
    estimateMinutes: estimates.get(cohortKeyOf(ticket)) ?? 60,
  }));
}

/** The estimate of one agent run: the median delay of the agent arm, in minutes. */
function estimateMinutes(tickets: readonly SiteTicket[]): Map<string, number> {
  const estimates = new Map<string, number>();
  cohortKeys(tickets, 12).forEach((key) => {
    const agent = tickets
      .filter((ticket) => cohortKeyOf(ticket) === key && ticket.arm === 'agent' && ticket.closedAt !== '')
      .map((ticket) => ticket.leadTimeH);
    const median = medianOrNull(agent);
    estimates.set(key, median === null ? 60 : Math.max(1, Math.round(median * 60)));
  });
  return estimates;
}

/** The recommendation of each cohort, computed by the app's own rule. */
function recommendationByCohort(tickets: readonly SiteTicket[]): Map<string, Recommendation> {
  const settings = sampleSettings();
  const recommendations = new Map<string, Recommendation>();
  cohortKeys(tickets, 12).forEach((key) => {
    const inCohort = tickets.filter((ticket) => cohortKeyOf(ticket) === key);
    const zone = inCohort.length > 0 ? inCohort[0].zone : '';
    const { agent, human } = armsOf(tickets, key);
    const balance = balanceOf(tickets, key);
    const conclusion = conclude(agent, human, settings.minArmSize, balance);
    const fired = guardrails(false, zone, settings.sensitiveZones, true);
    const delayBetter = agent.n > 0 && human.n > 0 && agent.rate >= human.rate;
    recommendations.set(key, recommendFrom(conclusion, balance, fired, delayBetter));
  });
  return recommendations;
}

/** What happened to the tickets the night took, for the morning report. */
export function nightOutcomes(tickets: readonly SiteTicket[], taken: readonly string[]): readonly NightOutcome[] {
  const byIssue = new Map(tickets.map((ticket) => [ticket.issueId, ticket]));
  return taken.map((issueKey) => {
    const ticket = byIssue.get(issueKey);
    const clean = ticket?.clean === true;
    const reopened = ticket?.reopened === true;
    return { issueKey, clean, reopened, proven: clean && !reopened };
  });
}

/* ------------------------------------------------------------ the freshness */

/** The freshness contract of every object type, read from the sample dataset. */
export function freshnessContracts(): readonly FreshnessContract[] {
  const commits = sampleCommitFacts();
  const reviews = sampleReviewFacts();
  const involvements = sampleInvolvements();
  const outcomes = sampleOutcomes();
  return [
    contract('commit', latestOf(commits.map((fact) => fact.committedAt)), 60),
    contract('pull-request', latestOf(reviews.map((fact) => fact.openedAt)), 120),
    contract('user', latestOf(involvements.map((item) => item.decidedAt)), 240),
    contract('issue', latestOf(outcomes.map((outcome) => outcome.closedAt)), 30),
  ];
}

/** One freshness contract: the object, its last read and the age it may reach. */
function contract(object: string, lastCollectedAt: string | null, maxAgeMinutes: number): FreshnessContract {
  return {
    object,
    lastCollectedAt,
    maxAgeMinutes,
    granted: lastCollectedAt !== null,
    probed: true,
    note: {
      fr: `Dernière lecture ${lastCollectedAt ?? 'jamais'} ; au-delà de ${maxAgeMinutes} min, la lecture est périmée.`,
      en: `Last read ${lastCollectedAt ?? 'never'}; beyond ${maxAgeMinutes} min the read is stale.`,
    },
  };
}

/** The most recent date of a list, or null when the list carries none. */
function latestOf(dates: readonly string[]): string | null {
  const usable = dates.filter((date) => date !== '');
  if (usable.length === 0) return null;
  return usable.reduce((latest, date) => (date > latest ? date : latest));
}
