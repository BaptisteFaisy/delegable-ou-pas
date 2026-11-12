/**
 * SPEC §13, §24 · DP-20 — the public API of the demo dataset.
 *
 * One entry point gives the demo its facts: twelve months of Jira history,
 * three epochs, the commits, the pull requests, the outcomes, the involvements,
 * the classifications, the recommendation cards and the running trial.
 *
 * The cards are computed by the domain (`src/domain/**`): the demo never
 * reimplements a rate, an interval or a conclusion. It only feeds the domain
 * with the facts of the dataset (zero duplication, SPEC §24.1).
 *
 * Everything the demo returns is marked as demo: `demo: true` on the cards,
 * the `demo-dataset` label on the tickets, the banner of `project.ts` and
 * `SAMPLE_IS_MARKED_AS_DEMO` (SPEC §13, DP-20).
 */
import type { Balance, DurationStat, ProportionStat } from '../types.js';
import type { IssueLink, JiraTicket, ReopeningFact, StatusHistory } from '../types-graph.js';
import type { Confidence, Coverage, Guardrail, Recommendation, RecommendationCard, Trial, TrialAssignment } from '../types-advice.js';
import type { CommitFact, IssueClass, Involvement, Outcome, ReviewFact } from '../types.js';
import type { Arm } from '../types.js';
import type { ArmComposition } from '../domain/balance.js';
import { compareBalance, composition } from '../domain/balance.js';
import { conclude, wording } from '../domain/conclusion.js';
import { confidenceOf, conditionsFor, guardrails, recommendFrom } from '../domain/recommendation.js';
// Résolution du conflit : l'union des deux côtés. `percentCeil`/`percentFloor`
// viennent du lot L10 (intégration), `enforceCompliance`/`draw`/`seededRandom`
// du lot D1 (base de référence) ; tous les deux sont utilisés dans le fichier.
import { enforceCompliance, draw } from '../domain/trial.js';
import { median, percent, percentCeil, percentFloor, wilsonInterval } from '../domain/stats.js';
import { seededRandom } from '../deps.js';
import type { Seed } from './issues.js';
import { CAS_LIMITES } from './cas-limites.js';
import { EPOCH_3 } from './epochs.js';
import { ticketSeeds } from './builder.js';
import {
  sampleClasses as classesOf,
  sampleHistories as historiesOf,
  sampleInvolvements as involvementsOf,
  sampleReopenings as reopeningsOf,
  sampleTickets as ticketsOf,
} from './history.js';
import { sampleCommitFacts as commitsOf, sampleSignaturePatterns } from './commits.js';
import { sampleReviewFacts as reviewsOf } from './pull-requests.js';
import { cleanOf, sampleLinks as linksOf, sampleOutcomes as outcomesOf } from './outcomes.js';
import {
  SAMPLE_BANNER,
  SAMPLE_DEMO_LABEL,
  SAMPLE_MIN_ARM_SIZE,
  SAMPLE_NOW,
  SAMPLE_PROJECT_ID,
  SAMPLE_PROJECT_KEY,
  SAMPLE_REFERENCE_DATE,
  SAMPLE_SENSITIVE_ZONES,
  SAMPLE_WINDOW_END,
  SAMPLE_WINDOW_START,
  sampleSettings,
} from './project.js';

/** The demo is a demo, everywhere (SPEC §13, DP-20). */
export const SAMPLE_IS_MARKED_AS_DEMO = true;

/** The label every demo card and map carries (SPEC §13, DP-20). */
export { SAMPLE_BANNER, SAMPLE_DEMO_LABEL, SAMPLE_PROJECT_KEY, SAMPLE_WINDOW_END, SAMPLE_WINDOW_START };

/** The settings and the epochs of the demo project (SPEC §16.5, SPEC §12). */
export { sampleSettings };
export { sampleEpochs } from './epochs.js';

/** The seeds of the demo: the single source of every figure (SPEC §24.1). */
const SEEDS: readonly Seed[] = ticketSeeds();

/** The seeds the whole dataset is built from (SPEC §24.1). */
export function sampleSeeds(): readonly Seed[] {
  return SEEDS;
}

/** Every demo ticket (SPEC §24.1: twelve months, one populated project). */
export function sampleTickets(): readonly JiraTicket[] {
  return ticketsOf(SEEDS);
}

/** Every commit fact of the demo (SPEC §18 table `commit_fact`). */
export function sampleCommitFacts(): readonly CommitFact[] {
  return commitsOf(SEEDS);
}

/** Every review fact of the demo (SPEC §18 table `review_fact`). */
export function sampleReviewFacts(): readonly ReviewFact[] {
  return reviewsOf(SEEDS);
}

/** Every outcome of the demo (SPEC §18 table `outcome`). */
export function sampleOutcomes(): readonly Outcome[] {
  return outcomesOf(SEEDS);
}

/** Every involvement of the demo (SPEC §18 table `involvement`). */
export function sampleInvolvements(): readonly Involvement[] {
  return involvementsOf(SEEDS);
}

/** Every classification of the demo (SPEC §18 table `issue_class`). */
export function sampleClasses(): readonly IssueClass[] {
  return classesOf(SEEDS);
}

/** Every status history of the demo (SPEC §17 "Historique Jira"). */
export function sampleHistories(): readonly StatusHistory[] {
  return historiesOf(SEEDS);
}

/** Every reopening of the demo (SPEC §6 "Réouverture"). */
export function sampleReopenings(): readonly ReopeningFact[] {
  return reopeningsOf(SEEDS);
}

/** The mention catalogue of the demo project (SPEC §5, DP-02). */
export { sampleSignaturePatterns };

/** The links between the demo tickets (SPEC §6, SPEC §17). */
export function sampleLinks(): readonly IssueLink[] {
  return linksOf(SEEDS);
}

/* -------------------------------------------------------------------- cards */

/** The identity of a cohort: same nature, same zone, same size (SPEC §4). */
interface CohortIdentity {
  readonly nature: string;
  readonly zone: string;
  readonly size: string;
  readonly epochId: string;
}

/** The figures of one cohort, as the domain reads them (SPEC §7). */
interface CohortFigures {
  readonly agent: ProportionStat | null;
  readonly human: ProportionStat | null;
  readonly agentLead: DurationStat | null;
  readonly humanLead: DurationStat | null;
  readonly agentTickets: readonly Seed[];
  readonly humanTickets: readonly Seed[];
  readonly failures: number;
  readonly reopened: number;
}

/** The most frequent cause of failure, per nature (SPEC §12). */
const CAUSE_OF: Readonly<Record<string, string>> = {
  'data-migration': 'migration non rejouable',
  bugfix: 'absence de test',
  'external-integration': 'zone sans conventions écrites',
  'ui-change': 'critères flous',
  refactor: 'reprise fragile',
};

/** The cohort a ticket belongs to (SPEC §7 rule 1). */
function identityOf(seed: Seed): CohortIdentity {
  return { nature: seed.nature, zone: seed.zone, size: seed.size, epochId: seed.epochId };
}

/** The tickets of one cohort (SPEC §7 rule 1). */
function cohortOf(seeds: readonly Seed[], identity: CohortIdentity): readonly Seed[] {
  return seeds.filter((seed) =>
    seed.nature === identity.nature &&
    seed.zone === identity.zone &&
    seed.size === identity.size &&
    seed.epochId === identity.epochId);
}

/** The rate and the delay of one arm (SPEC §6, SPEC §7 rule 3). */
function figuresOf(arm: readonly Seed[]): { rate: ProportionStat | null; lead: DurationStat | null } {
  if (arm.length === 0) return { rate: null, lead: null };
  const clean = arm.filter((seed) => cleanOf(seed)).length;
  const leads = arm.filter((seed) => seed.closedAt !== '').map((seed) => seed.leadTimeH);
  return {
    rate: wilsonInterval(clean, arm.length),
    lead: leads.length === 0 ? null : { n: leads.length, medianH: median(leads) },
  };
}

/**
 * The figures of one cohort, arm by arm (SPEC §7).
 *
 * Only the closed tickets enter a rate: an open ticket has no outcome yet
 * (SPEC §6). Every quoted cohort is mature at the demo's reference date.
 */
function cohortFigures(cohort: readonly Seed[]): CohortFigures {
  const closed = cohort.filter((seed) => seed.closedAt !== '');
  const agentTickets = closed.filter((seed) => seed.arm === 'agent');
  const humanTickets = closed.filter((seed) => seed.arm === 'human');
  const agent = figuresOf(agentTickets);
  const human = figuresOf(humanTickets);
  const failures = agentTickets.filter((seed) => !cleanOf(seed)).length;
  const reopened = agentTickets.filter((seed) => seed.failure.reopened).length;
  return {
    agent: agent.rate,
    human: human.rate,
    agentLead: agent.lead,
    humanLead: human.lead,
    agentTickets,
    humanTickets,
    failures,
    reopened,
  };
}

/** The composition of one arm, for the balance check (SPEC §7 rule 5). */
function compositionOf(arm: readonly Seed[]): ArmComposition {
  const sizes: Record<string, number> = {};
  const natures: Record<string, number> = {};
  for (const seed of arm) {
    sizes[seed.size] = (sizes[seed.size] ?? 0) + 1;
    natures[seed.nature] = (natures[seed.nature] ?? 0) + 1;
  }
  return composition(arm.length, sizes, natures);
}

/** The reason line of the clean closure, as the card shows it (SPEC §8). */
function cleanLine(figures: CohortFigures): string {
  const agent = figures.agent;
  const human = figures.human;
  if (agent === null || human === null) return 'Clôture propre : pas assez de recul';
  return (
    `Clôture propre : ${percent(agent.rate)} avec agent ` +
    `(${agent.n} tickets, entre ${percentFloor(agent.ciLow)} et ${percentCeil(agent.ciHigh)}), ` +
    `${percent(human.rate)} sans ` +
    `(${human.n} tickets, entre ${percentFloor(human.ciLow)} et ${percentCeil(human.ciHigh)})`
  );
}

/** What went wrong with the agent in this cohort (SPEC §8, SPEC §26). */
function failureCausesOf(figures: CohortFigures, nature: string): readonly string[] {
  if (figures.failures === 0) return [];
  const cause = CAUSE_OF[nature] ?? 'reprise fragile';
  if (figures.reopened > 0) {
    return [`${figures.reopened} réouvertures sur ${figures.failures} pour une ${cause}`];
  }
  return [`${figures.failures} échecs sur ${figures.agentTickets.length} sans réouverture`];
}

/** The past tickets the advice rests on (SPEC §4 "Fondement", SPEC §8). */
function referenceKeysOf(seed: Seed, cohort: readonly Seed[]): readonly string[] {
  const family = cohort[0]?.family ?? '';
  const pinned = CAS_LIMITES
    .filter((cas) => cas.familyId === family && cas.reference === true && cas.key !== seed.key)
    .map((cas) => cas.key)
    .sort();
  if (pinned.length > 0) return pinned;
  return cohort
    .filter((candidate) => candidate.closedAt !== '' && candidate.key !== seed.key)
    .slice(0, 3)
    .map((candidate) => candidate.key);
}

/** The guardrails that fire on one ticket (SPEC §8 "Les garde-fous", DP-12). */
function guardrailsOf(seed: Seed, openIncident: boolean): readonly Guardrail[] {
  return guardrails(openIncident, seed.zone, SAMPLE_SENSITIVE_ZONES, seed.hasDescription);
}

/** One recommendation card, computed by the domain (SPEC §8, SPEC §16.1). */
function cardOf(seed: Seed, cohort: readonly Seed[], openIncident: boolean): RecommendationCard {
  const figures = cohortFigures(cohort);
  const balance: Balance = compareBalance(
    compositionOf(figures.agentTickets),
    compositionOf(figures.humanTickets),
  );
  const conclusion = conclude(figures.agent, figures.human, SAMPLE_MIN_ARM_SIZE, balance);
  const delayBetter =
    figures.agentLead !== null &&
    figures.humanLead !== null &&
    figures.agentLead.medianH < figures.humanLead.medianH;
  const fired = guardrailsOf(seed, openIncident);
  const value: Recommendation = recommendFrom(conclusion, balance, fired, delayBetter);
  const confidence: Confidence = confidenceOf(figures.agent, figures.human, conclusion);
  return {
    issueId: seed.id,
    issueKey: seed.key,
    value,
    cohort: {
      level: 'nature-zone-size',
      nature: seed.nature,
      zone: seed.zone,
      size: seed.size,
    },
    epochId: seed.epochId,
    agent: figures.agent,
    human: figures.human,
    agentLeadTime: figures.agentLead,
    humanLeadTime: figures.humanLead,
    conclusion,
    balance,
    confidence,
    reasons: [
      `Cohorte : ${seed.nature} · ${seed.zone} · taille ${seed.size} ` +
      `(${figures.agent?.n ?? 0} tickets avec agent, ${figures.human?.n ?? 0} sans)`,
      cleanLine(figures),
      wording(conclusion).gap,
    ],
    conditions: conditionsFor(value, sampleSettings()),
    guardrails: fired,
    referenceIssueKeys: referenceKeysOf(seed, cohort),
    failureCauses: failureCausesOf(figures, seed.nature),
    demo: SAMPLE_IS_MARKED_AS_DEMO,
    computedAt: SAMPLE_NOW,
  };
}

/** The tickets the demo shows a card for: the SPEC card and the guardrails. */
const SHOWCASE_KEYS: readonly string[] = [
  'PROJ-412', 'PROJ-455', 'PROJ-457', 'PROJ-458', 'PROJ-460',
  'PROJ-509', 'PROJ-517', 'PROJ-523',
];

/**
 * The recommendation cards of the demo (SPEC §8, SPEC §24.1).
 *
 * One card for the ticket the video shows, one per guardrail: an open
 * incident, a sensitive zone, missing acceptance criteria and the ticket of
 * the running trial.
 */
export function sampleCards(): readonly RecommendationCard[] {
  const openIncidents = new Set(
    linksOf(SEEDS).filter((link) => link.linkedIsIncident).map((link) => link.issueId),
  );
  return SHOWCASE_KEYS.flatMap((key) => {
    const seed = SEEDS.find((candidate) => candidate.key === key);
    if (seed === undefined) return [];
    const cohort = cohortOf(SEEDS, identityOf(seed));
    return [cardOf(seed, cohort, openIncidents.has(seed.id))];
  });
}

/**
 * The controlled trial of the demo (SPEC §11).
 *
 * It runs on the cohort where the app could not conclude; the draw is
 * reproducible from the seed, so re-running the trial never changes an
 * assignment (SPEC §11 step 2).
 */
export function sampleTrial(): Trial {
  return {
    id: 'trial-demo-001',
    projectId: SAMPLE_PROJECT_ID,
    cohort: { level: 'nature-zone-size', nature: 'external-integration', zone: 'api', size: 'M' },
    epochId: EPOCH_3,
    seed: 'demo-trial-seed-01',
    startsAt: '2026-11-02',
    endsAt: '2026-12-15',
    state: 'running',
    stopReason: '',
  };
}

/**
 * The assignments of the running trial, one per ticket of its cohort.
 *
 * The draw comes from the seed of the trial (SPEC §11 step 2); a ticket whose
 * draw was not respected leaves the trial with its reason (recipe 16).
 */
export function sampleTrialAssignments(): readonly TrialAssignment[] {
  const trial = sampleTrial();
  const cohort = SEEDS.filter((seed) =>
    seed.epochId === trial.epochId &&
    seed.nature === trial.cohort.nature &&
    seed.zone === trial.cohort.zone &&
    seed.size === trial.cohort.size);
  return cohort
    .filter((seed) => seed.arm === 'agent' || seed.arm === 'human')
    .map((seed) => {
      const actual: Arm = seed.arm === 'agent' ? 'agent' : 'human';
      return enforceCompliance(draw(trial, seed.id, seededRandom()), actual);
    });
}

/**
 * The coverage of the demo project (SPEC §16.6, §19 "Droits", recipe 15).
 *
 * Two rights are missing on the graph: the pull requests and the people. The
 * screen says so out loud instead of showing a silent zero (recipe 15).
 */
export function sampleCoverage(): Coverage {
  const known = SEEDS.filter((seed) => seed.level !== 'unknown').length;
  return {
    projectId: SAMPLE_PROJECT_ID,
    knownIssues: known,
    totalIssues: SEEDS.length,
    permissions: [
      { objectType: 'issue', state: 'granted', testedAt: SAMPLE_REFERENCE_DATE },
      { objectType: 'commit', state: 'granted', testedAt: SAMPLE_REFERENCE_DATE },
      { objectType: 'pull-request', state: 'missing', testedAt: SAMPLE_REFERENCE_DATE },
      { objectType: 'user', state: 'missing', testedAt: SAMPLE_REFERENCE_DATE },
    ],
    lastCollectionAt: SAMPLE_REFERENCE_DATE,
    lastCollectionOk: false,
    demo: SAMPLE_IS_MARKED_AS_DEMO,
  };
}

/** The scenarios of the base, and the named cases they carry (SPEC §21). */
export { SCENARIOS, FILLERS, ALL_SCENARIOS } from './scenarios.js';
export { CAS_LIMITES } from './cas-limites.js';

/** The reference date the demo figures are computed on (SPEC §24.1). */
export { SAMPLE_REFERENCE_DATE };
