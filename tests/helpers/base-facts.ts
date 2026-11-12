/**
 * The reference dataset, read once from `src/sample/` — SPEC §13, §24; DP-20.
 *
 * This module holds the *facts* of the base: the tickets with their level,
 * their arm and their outcome, the cohorts they form, the named edge cases and
 * the running trial. Everything comes from the dataset the product ships; no
 * figure is written by hand here, so a test can never disagree with the demo.
 *
 * The cohort figures are the ones the product itself computes: the same
 * `groupByCohort` (SPEC §7 rule 1) and the same `cohortStatRows` the nightly
 * job writes in the cache, so a test reads the numbers the app would show.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type {
  Arm,
  Balance,
  CohortKey,
  Conclusion,
  CommitFact,
  DurationStat,
  Epoch,
  IssueClass,
  Involvement,
  Level,
  Outcome,
  ProportionStat,
  ReviewFact,
  SignaturePattern,
  Source,
} from '../../src/types.js';
import type {
  Confidence,
  Coverage,
  ProjectSettings,
  Recommendation,
  RecommendationCard,
  Trial,
  TrialAssignment,
} from '../../src/types-advice.js';
import type { IssueLink, JiraTicket, StatusHistory } from '../../src/types-graph.js';
import type { Seed } from '../../src/sample/issues.js';
import type { CasGroup, CasLimite } from '../../src/sample/cas-limites.js';
import type { Scenario } from '../../src/sample/scenarios.js';
import {
  sampleCards,
  sampleClasses,
  sampleCommitFacts,
  sampleCoverage,
  sampleEpochs,
  sampleHistories,
  sampleInvolvements,
  sampleLinks,
  sampleOutcomes,
  sampleReopenings,
  sampleReviewFacts,
  sampleSeeds,
  sampleSettings,
  sampleTickets,
  sampleTrial,
  sampleTrialAssignments,
} from '../../src/sample/index.js';
import { sampleSignaturePatterns } from '../../src/sample/commits.js';
import { CAS_BY_KEY } from '../../src/sample/cas-limites.js';
import { ALL_SCENARIOS } from '../../src/sample/scenarios.js';
import { armOf, buildArms, groupByCohort, type CohortGroup, type CohortTicket } from '../../src/domain/cohort.js';
import { splitByEpoch } from '../../src/domain/epochs.js';
import { cohortStatRows, compositionOf } from '../../src/handlers/recompute.js';
import { compareBalance } from '../../src/domain/balance.js';
import { confidenceOf, recommendFrom } from '../../src/domain/recommendation.js';
import { balanceOfConclusion } from '../../src/actions/get-cohort.js';
import { maskCohort } from '../../src/domain/privacy.js';
import type { ProjectFacts } from '../../src/handlers/project-facts.js';

/** The instant every figure of the base is computed on (SPEC §24.1, no clock). */
export const BASE_NOW = '2026-11-30T12:00:00Z';

/** The project the base belongs to (SPEC §13). */
export const BASE_PROJECT_ID = 'proj-demo-001';

/** One ticket of the base: its level, its arm and what became of it. */
export interface Ticket {
  readonly key: string;
  readonly id: string;
  readonly level: Level;
  readonly source: Source;
  /** The arm the ticket belongs to; `null` when the involvement is unknown. */
  readonly arm: Arm | null;
  /** True when the ticket is closed; a censored ticket is still open. */
  readonly closed: boolean;
  /** True when the closure is a clean one (SPEC §6). */
  readonly clean: boolean;
  /** True when the ticket is old enough to be judged (SPEC §6, maturity). */
  readonly matured: boolean;
  readonly involvement: Involvement;
  readonly outcome: Outcome;
  /** The ticket as Jira shows it (SPEC §17). */
  readonly jira: JiraTicket;
  /** The role that worked on the ticket: a role, never a person (DP-17). */
  readonly role: string;
  /** The cohort identity of the ticket (SPEC §7 rule 1). */
  readonly nature: string;
  readonly zone: string;
  readonly size: string;
  readonly epochId: string;
}

/** One cohort of the base: same nature, zone, size and epoch (SPEC §7 rule 1). */
export interface CohorteVue {
  /** The key of the cohort: `epoch|nature|zone|size`. */
  readonly cle: string;
  readonly key: CohortKey;
  readonly epochId: string;
  readonly agent: readonly Ticket[];
  readonly human: readonly Ticket[];
  /** Tickets whose involvement could not be read (DP-03). */
  readonly inconnu: readonly Ticket[];
  /** The clean closure of the agent arm, with its size and its interval. */
  readonly agentStat: ProportionStat | null;
  readonly humanStat: ProportionStat | null;
  readonly agentLead: DurationStat | null;
  readonly humanLead: DurationStat | null;
  /** The composition verdict of the two arms (SPEC §7 rule 5). */
  readonly balance: Balance;
  readonly conclusion: Conclusion;
  /** The cohort-level advice, before the ticket's own guardrails (SPEC §8). */
  readonly recommandation: Recommendation;
  readonly confidence: Confidence;
  /** Distinct people behind the cohort, read from the dataset's roles. */
  readonly peopleCount: number;
  /** True when fewer than three people carry the cohort (SPEC §7 rule 8). */
  readonly masked: boolean;
}

/** One named edge case of the base (SPEC §21, §22). */
export interface CasVue {
  readonly key: string;
  /** The case, in the words of the dataset. */
  readonly cas: string;
  readonly familyId: string;
  readonly group: CasGroup;
  readonly seed: Seed | undefined;
  readonly ticket: Ticket | undefined;
}

/** The controlled trial of the base, with its draws (SPEC §11). */
export interface EssaiVue {
  readonly trial: Trial;
  readonly assignments: readonly TrialAssignment[];
  /** Draws the team respected. */
  readonly complied: number;
  /** Draws the team did not respect: they left the trial with a reason. */
  readonly excluded: number;
}

/** The whole dataset, as the product ships it. */
export interface Base {
  readonly now: string;
  readonly projectId: string;
  readonly seeds: readonly Seed[];
  readonly tickets: readonly Ticket[];
  readonly jira: readonly JiraTicket[];
  readonly classes: readonly IssueClass[];
  readonly involvements: readonly Involvement[];
  readonly outcomes: readonly Outcome[];
  readonly commitFacts: readonly CommitFact[];
  readonly reviewFacts: readonly ReviewFact[];
  readonly histories: readonly StatusHistory[];
  readonly links: readonly IssueLink[];
  readonly reopenings: readonly import('../../src/types-graph.js').ReopeningFact[];
  /** The showcase cards the dataset ships (SPEC §8). */
  readonly cards: readonly RecommendationCard[];
  readonly epochs: readonly Epoch[];
  readonly settings: ProjectSettings;
  readonly coverage: Coverage;
  readonly patterns: readonly SignaturePattern[];
  readonly trial: Trial;
  readonly trialAssignments: readonly TrialAssignment[];
  readonly scenarios: readonly Scenario[];
  readonly casLimites: readonly CasLimite[];
}

let cached: Base | undefined;

/** The dataset facts, read once and kept (SPEC §24.1: deterministic, no clock). */
export function base(): Readonly<Base> {
  if (cached !== undefined) return cached;
  const seeds = sampleSeeds();
  const jira = sampleTickets();
  const involvements = sampleInvolvements();
  const outcomes = sampleOutcomes();
  cached = {
    now: BASE_NOW,
    projectId: BASE_PROJECT_ID,
    seeds,
    jira,
    tickets: ticketsOf(seeds, jira, involvements, outcomes),
    classes: sampleClasses(),
    involvements,
    outcomes,
    commitFacts: sampleCommitFacts(),
    reviewFacts: sampleReviewFacts(),
    histories: sampleHistories(),
    links: sampleLinks(),
    reopenings: sampleReopenings(),
    cards: sampleCards(),
    epochs: sampleEpochs(),
    settings: sampleSettings(),
    coverage: sampleCoverage(),
    patterns: sampleSignaturePatterns(),
    trial: sampleTrial(),
    trialAssignments: sampleTrialAssignments(),
    scenarios: ALL_SCENARIOS,
    casLimites: Object.values(CAS_BY_KEY),
  };
  return cached;
}

/** The tickets of the base, joined with their involvement and their outcome. */
function ticketsOf(
  seeds: readonly Seed[],
  jira: readonly JiraTicket[],
  involvements: readonly Involvement[],
  outcomes: readonly Outcome[],
): readonly Ticket[] {
  const byId = new Map(jira.map((ticket) => [ticket.id, ticket]));
  const involvementById = new Map(involvements.map((item) => [item.issueId, item]));
  const outcomeById = new Map(outcomes.map((item) => [item.issueId, item]));
  return seeds.map((seed) => {
    const involvement = involvementById.get(seed.id);
    const outcome = outcomeById.get(seed.id);
    const ticket = byId.get(seed.id);
    if (involvement === undefined || outcome === undefined || ticket === undefined) {
      throw new Error(`base: incoherent dataset for ${seed.key}`);
    }
    return {
      key: seed.key,
      id: seed.id,
      level: involvement.level,
      source: involvement.source,
      arm: armOf(involvement.level),
      closed: outcome.closedAt !== '',
      clean: outcome.clean,
      matured: outcome.matureAt !== '' && outcome.matureAt <= BASE_NOW,
      involvement,
      outcome,
      jira: ticket,
      role: seed.role,
      nature: seed.nature,
      zone: seed.zone,
      size: seed.size,
      epochId: seed.epochId,
    };
  });
}

/** The facts the domain reads, by ticket id (SPEC §17). */
export function baseFacts(): ProjectFacts {
  const current = base();
  const reviews = new Map<string, ReviewFact[]>();
  for (const fact of current.reviewFacts) {
    const list = reviews.get(fact.issueId);
    if (list === undefined) reviews.set(fact.issueId, [fact]);
    else list.push(fact);
  }
  return {
    involvements: new Map(current.involvements.map((item) => [item.issueId, item])),
    classes: new Map(current.classes.map((item) => [item.issueId, item])),
    outcomes: new Map(current.outcomes.map((item) => [item.issueId, item])),
    reviews,
  };
}

/** The ticket of the base, by its Jira key. */
export function ticketDe(key: string): Readonly<Ticket> {
  const found = base().tickets.find((ticket) => ticket.key === key);
  if (found === undefined) throw new Error(`base: unknown ticket ${key}`);
  return found;
}

/** The date that places a ticket in an epoch: its closure, else its decision. */
function dateDe(ticket: CohortTicket): string {
  const current = base();
  const found = current.tickets.find((item) => item.id === ticket.issueId);
  return found?.outcome.closedAt || found?.involvement.decidedAt || '';
}

/** The classified tickets of the base, with the level the app reads (SPEC §17). */
function cohortTickets(): readonly CohortTicket[] {
  const current = base();
  const tickets: CohortTicket[] = [];
  for (const ticket of current.tickets) {
    const issueClass = current.classes.find((item) => item.issueId === ticket.id);
    if (issueClass === undefined) continue;
    const cohort: CohortTicket = {
      issueId: ticket.id,
      projectId: current.projectId,
      level: ticket.level,
      issueClass,
    };
    if (dateDe(cohort) === '') continue;
    tickets.push(cohort);
  }
  return tickets;
}

/** The cohorts of the base, one per epoch and per nature × zone × size. */
export function cohortes(): readonly CohorteVue[] {
  const current = base();
  const byId = new Map(current.tickets.map((ticket) => [ticket.id, ticket]));
  const tickets = cohortTickets();
  const timeline = tickets.map((ticket) => ({
    issueId: ticket.issueId,
    projectId: ticket.projectId,
    at: dateDe(ticket),
  }));
  const views: CohorteVue[] = [];
  for (const slice of splitByEpoch(timeline, current.epochs)) {
    const ids = new Set(slice.tickets.map((ticket) => ticket.issueId));
    const inSlice = tickets.filter((ticket) => ids.has(ticket.issueId));
    for (const group of groupByCohort(inSlice, 'nature-zone-size')) {
      views.push(viewOf(group, slice.epoch?.id ?? '', byId));
    }
  }
  return views;
}

/** One cohort view: its arms, its figures and its verdict. */
function viewOf(
  group: CohortGroup,
  epochId: string,
  byId: ReadonlyMap<string, Ticket>,
): CohorteVue {
  const current = base();
  const arms = buildArms(group.tickets);
  const rows = cohortStatRows(current.settings, epochId, group.key, group.tickets, baseFacts(), current.now);
  const agentRow = rows.find((row) => row.arm === 'agent');
  const humanRow = rows.find((row) => row.arm === 'human');
  const balance = compareBalance(compositionOf(arms.agent), compositionOf(arms.human));
  const conclusion = rows[0]?.conclusion ?? 'not-enough-data';
  const delayBetter = agentRow !== undefined && humanRow !== undefined
    && agentRow.medianLeadH < humanRow.medianLeadH;
  const people = new Set(group.tickets.map((ticket) => byId.get(ticket.issueId)?.role ?? ''));
  const agentStat = agentRow?.clean ?? null;
  const humanStat = humanRow?.clean ?? null;
  return {
    cle: `${epochId}|${group.key.nature}|${group.key.zone ?? ''}|${group.key.size ?? ''}`,
    key: group.key,
    epochId,
    agent: arms.agent.map((ticket) => byId.get(ticket.issueId)).filter(isTicket),
    human: arms.human.map((ticket) => byId.get(ticket.issueId)).filter(isTicket),
    inconnu: arms.unknown.map((ticket) => byId.get(ticket.issueId)).filter(isTicket),
    agentStat,
    humanStat,
    agentLead: agentRow === undefined ? null : { n: agentRow.clean.n, medianH: agentRow.medianLeadH },
    humanLead: humanRow === undefined ? null : { n: humanRow.clean.n, medianH: humanRow.medianLeadH },
    balance,
    conclusion,
    recommandation: recommendFrom(
      conclusion,
      balanceOfConclusion(conclusion !== 'not-enough-data'),
      [],
      delayBetter,
    ),
    confidence: confidenceOf(agentStat, humanStat, conclusion),
    peopleCount: people.size,
    masked: maskCohort(people.size),
  };
}

/** Keeps the tickets that exist (a cohort ticket always has one). */
function isTicket(ticket: Ticket | undefined): ticket is Ticket {
  return ticket !== undefined;
}

/** The cohort of the base whose key is `epoch|nature|zone|size`. */
export function cohorte(cle: string): Readonly<CohorteVue> {
  const found = cohortes().find((view) => view.cle === cle);
  if (found === undefined) throw new Error(`base: unknown cohort ${cle}`);
  return found;
}

/** The cohort of the base carried by the named family of the dataset. */
export function cohorteDe(familyId: string): Readonly<CohorteVue> {
  const scenario = base().scenarios.find((item) => item.id === familyId);
  if (scenario === undefined) throw new Error(`base: unknown family ${familyId}`);
  return cohorte(`${scenario.epochId}|${scenario.nature}|${scenario.zone}|${scenario.size}`);
}

/** The first cohort of the base whose advice is the wanted one (SPEC §8 table). */
export function cohorteParAvis(voulu: Recommendation): Readonly<CohorteVue> {
  const found = cohortes().find((view) => view.recommandation === voulu);
  if (found === undefined) throw new Error(`base: no cohort advises ${voulu}`);
  return found;
}

/** The named edge case of the base, by its ticket key (SPEC §21). */
export function casLimite(key: string): Readonly<CasVue> {
  const cas = CAS_BY_KEY[key];
  if (cas === undefined) throw new Error(`base: unknown case ${key}`);
  const seed = base().seeds.find((item) => item.key === key);
  const ticket = seed === undefined ? undefined : base().tickets.find((item) => item.key === key);
  return { key, cas: cas.cas, familyId: cas.familyId, group: cas.group, seed, ticket };
}

/** The tickets of the base that are still open: the censored ones (SPEC §6). */
export function censures(): readonly Ticket[] {
  return base().tickets.filter((ticket) => !ticket.closed);
}

/** The tickets of the base whose involvement could not be read (DP-03). */
export function inconnus(): readonly Ticket[] {
  return base().tickets.filter((ticket) => ticket.level === 'unknown');
}

/** The controlled trial of the base, with its draws (SPEC §11). */
export function essai(): Readonly<EssaiVue> {
  const assignments = base().trialAssignments;
  return {
    trial: base().trial,
    assignments,
    complied: assignments.filter((assignment) => assignment.complied).length,
    excluded: assignments.filter((assignment) => !assignment.complied).length,
  };
}

/** The epochs of the base (SPEC §7 rule 6, §12). */
export function epoques(): readonly Epoch[] {
  return base().epochs;
}