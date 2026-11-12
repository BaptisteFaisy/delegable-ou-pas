/**
 * The nightly recomputation — SPEC §17 "Statistiques", §7, §10, §8; DP-07,
 * DP-18, DP-21, DP-22.
 *
 * One place rebuilds the caches the whole app reads: cohort statistics per
 * epoch, calibration rows, and the recommendation cards of the tickets that
 * matured since the last pass. Every figure is computed by the frozen domain
 * (L1–L4) — this module only orchestrates (zero duplication).
 *
 * Slicing (DP-18): the per-project lists and the card rebuilds are bounded,
 * so a run always fits under the 900 s trigger limit (SPEC §19); the pass
 * resumes where it stopped, because a card older than the maturity of its
 * ticket stays "stale" until it is rebuilt.
 *
 * CONTRACT-NEEDED: types-advice.CohortStat.peopleCount — the app stores no
 * person identifier anywhere (SPEC §18, DP-17) and the graph `user` right is
 * withdrawn while the API is in Preview, so the nightly pass cannot count the
 * people behind a cohort. It writes `0`: cohorts are masked by construction
 * until a people measure exists (recipe 11 stays safe; the demo dataset seeds
 * its own counts).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { IssueClass, Outcome } from '../types.js';
import type { CohortStat, ProjectSettings, RecommendationCard } from '../types-advice.js';
import type { CohortKey, Epoch, ProportionStat } from '../types.js';
import type { CohortTicket } from '../domain/cohort.js';
import type { ArmComposition } from '../domain/balance.js';
import { buildArms, cohortKeyOf, groupByCohort, isInCohort, widen } from '../domain/cohort.js';
import { splitByEpoch, currentEpoch } from '../domain/epochs.js';
import { compareBalance, composition } from '../domain/balance.js';
import { conclude } from '../domain/conclusion.js';
import { medianOrNull, wilsonInterval } from '../domain/stats.js';
import { reviewLoad } from '../domain/review.js';
import { judgeable } from '../domain/maturity.js';
import { calibrate } from '../domain/calibration.js';
import { confidenceOf, conditionsFor, guardrails, recommendFrom } from '../domain/recommendation.js';
import { RECOMMENDATIONS } from '../types-advice.js';
import { hasAcceptanceCriteria } from '../collect/jira-adf.js';
import { balanceOfConclusion } from '../actions/get-cohort.js';
import { bilingualReasons } from './reasons.js';
import { NIGHTLY_LIST_LIMIT, type ProjectFacts } from './project-facts.js';

/** Cards rebuilt per project per run: the slice that keeps the 900 s (DP-18). */
export const RECOMPUTE_SLICE = 20;
/** Judgeable outcomes scanned per run to find the stale cards. */
export const STALE_SCAN_LIMIT = 100;
/** Reference tickets kept behind one card (SPEC §4 "Fondement"), bounded. */
export const REFERENCE_LIMIT = 3;

/* ---------------------------------------------------------- cohort stats */

function sizeCounts(tickets: readonly CohortTicket[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ticket of tickets) counts[ticket.issueClass.size] = (counts[ticket.issueClass.size] ?? 0) + 1;
  return counts;
}

function natureCounts(tickets: readonly CohortTicket[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ticket of tickets) counts[ticket.issueClass.nature] = (counts[ticket.issueClass.nature] ?? 0) + 1;
  return counts;
}

/** The composition of one arm, for the balance verdict (SPEC §7 rule 5). */
export function compositionOf(tickets: readonly CohortTicket[]): ArmComposition {
  return composition(tickets.length, sizeCounts(tickets), natureCounts(tickets));
}

/** The clean proportion and median delay of one arm (SPEC §6, §7 rule 3). */
function armFigures(
  tickets: readonly CohortTicket[],
  facts: ProjectFacts,
): { clean: ProportionStat; medianLeadH: number; reviewLoad: number } {
  let cleanCount = 0;
  const leadTimes: number[] = [];
  const loads: number[] = [];
  for (const ticket of tickets) {
    const outcome = facts.outcomes.get(ticket.issueId);
    if (outcome !== undefined) {
      if (outcome.clean) cleanCount += 1;
      if (outcome.closedAt !== '') leadTimes.push(outcome.leadTimeH);
    }
    const reviews = facts.reviews.get(ticket.issueId);
    if (reviews !== undefined && reviews.length > 0) loads.push(reviewLoad(reviews));
  }
  return {
    clean: wilsonInterval(cleanCount, tickets.length),
    medianLeadH: medianOrNull(leadTimes) ?? 0,
    reviewLoad: loads.length === 0 ? 0 : loads.reduce((a, b) => a + b, 0) / loads.length,
  };
}

/** One cohort of one epoch becomes its two cached arm rows (SPEC §7). */
export function cohortStatRows(
  settings: ProjectSettings,
  epochId: string,
  key: CohortKey,
  tickets: readonly CohortTicket[],
  facts: ProjectFacts,
  computedAt: string,
): CohortStat[] {
  const arms = buildArms(tickets);
  const agent = armFigures(arms.agent, facts);
  const human = armFigures(arms.human, facts);
  const balance = compareBalance(compositionOf(arms.agent), compositionOf(arms.human));
  const agentStat = arms.agent.length === 0 ? null : agent.clean;
  const humanStat = arms.human.length === 0 ? null : human.clean;
  const conclusion = conclude(agentStat, humanStat, settings.minArmSize, balance);
  return (['agent', 'human'] as const).map((arm) => {
    const figures = arm === 'agent' ? agent : human;
    return {
      projectId: settings.projectId,
      epochId,
      key,
      arm,
      clean: figures.clean,
      medianLeadH: figures.medianLeadH,
      reviewLoad: figures.reviewLoad,
      peopleCount: 0, // no people measure available — masked by construction (header)
      conclusion,
      computedAt,
    };
  });
}

/** One ticket joined into what the cohort pass needs; null when unclassifiable. */
function cohortTicketOf(settings: ProjectSettings, issueId: string, facts: ProjectFacts): CohortTicket | null {
  const issueClass = facts.classes.get(issueId);
  if (issueClass === undefined) return null;
  const at = facts.outcomes.get(issueId)?.closedAt || facts.involvements.get(issueId)?.decidedAt || '';
  if (at === '') return null;
  return {
    issueId,
    projectId: settings.projectId,
    level: facts.involvements.get(issueId)?.level ?? 'unknown',
    issueClass,
  };
}

/** Rebuilds every cohort of every epoch of one project (SPEC §7 rule 6). */
export async function recomputeCohorts(deps: Deps, settings: ProjectSettings, facts: ProjectFacts): Promise<number> {
  const epochs = await deps.stores.epoch.listByProject(settings.projectId);
  const tickets: CohortTicket[] = [];
  const timeline: { issueId: string; projectId: string; at: string }[] = [];
  for (const issueId of facts.classes.keys()) {
    const ticket = cohortTicketOf(settings, issueId, facts);
    if (ticket === null) continue;
    tickets.push(ticket);
    const at = facts.outcomes.get(issueId)?.closedAt || facts.involvements.get(issueId)?.decidedAt || '';
    timeline.push({ issueId, projectId: settings.projectId, at });
  }
  const computedAt = deps.clock.now();
  const byId = new Map(tickets.map((ticket) => [ticket.issueId, ticket]));
  const rows: CohortStat[] = [];
  for (const slice of splitByEpoch(timeline, epochs)) {
    const sliceTickets = slice.tickets
      .map((entry) => byId.get(entry.issueId))
      .filter((ticket): ticket is CohortTicket => ticket !== undefined);
    for (const group of groupByCohort(sliceTickets, 'nature-zone-size')) {
      rows.push(...cohortStatRows(settings, slice.epoch?.id ?? '', group.key, group.tickets, facts, computedAt));
    }
  }
  await deps.stores.cohortStat.saveMany(rows);
  return rows.length;
}

/* ------------------------------------------------------------- calibration */

/** Rebuilds the calibration rows of the current epoch (SPEC §10, DP-21). */
export async function recomputeCalibration(deps: Deps, settings: ProjectSettings, facts: ProjectFacts): Promise<number> {
  const epochs = await deps.stores.epoch.listByProject(settings.projectId);
  const current: Epoch | null = currentEpoch(epochs);
  if (current === null) return 0;
  const now = deps.clock.now();
  const rows = [];
  for (const value of RECOMMENDATIONS) {
    const cards = await deps.stores.recommendation.listByProject(settings.projectId, value, NIGHTLY_LIST_LIMIT);
    let cleanCount = 0;
    let n = 0;
    for (const card of cards) {
      const outcome = facts.outcomes.get(card.issueId);
      if (outcome === undefined || !judgeable([outcome], now).includes(outcome)) continue;
      n += 1;
      if (outcome.clean) cleanCount += 1;
    }
    if (n > 0) rows.push(calibrate(settings.projectId, current.id, value, cleanCount, n));
  }
  await deps.stores.calibration.saveMany(rows);
  return rows.length;
}

/* ------------------------------------------------------- recommendation cards */

/** Walks the cohort fallback until rows carry a conclusion (SPEC §7 rule 1). */
async function cohortRowsWithFallback(
  deps: Deps,
  settings: ProjectSettings,
  epochId: string,
  start: CohortKey,
): Promise<{ key: CohortKey; rows: CohortStat[] }> {
  let key: CohortKey | null = start;
  let rows: CohortStat[] = [];
  while (key !== null) {
    rows = await deps.stores.cohortStat.listByCohort(settings.projectId, epochId, key);
    if (rows.some((row) => row.conclusion !== 'not-enough-data')) return { key, rows };
    key = widen(key);
  }
  return { key: start, rows: [] };
}

/** Up to three past clean agent tickets of the cohort (SPEC §4 "Fondement"). */
async function referenceKeys(deps: Deps, key: CohortKey, facts: ProjectFacts): Promise<string[]> {
  const keys: string[] = [];
  for (const [issueId, issueClass] of facts.classes) {
    if (keys.length >= REFERENCE_LIMIT) break;
    if (!isInCohort(key, issueClass)) continue;
    const level = facts.involvements.get(issueId)?.level ?? 'unknown';
    if (level !== 'autonomous' && level !== 'driven') continue;
    if (facts.outcomes.get(issueId)?.clean !== true) continue;
    const ticket = await deps.jira.getTicket(issueId);
    if (ticket !== null) keys.push(ticket.key);
  }
  return keys;
}

/** Rebuilds the card of one matured ticket from the caches (SPEC §8, DP-11). */
export async function cardForIssue(
  deps: Deps,
  settings: ProjectSettings,
  issueId: string,
  facts: ProjectFacts,
): Promise<RecommendationCard | null> {
  const issueClass = facts.classes.get(issueId);
  if (issueClass === undefined) return null;
  const epochs = await deps.stores.epoch.listByProject(settings.projectId);
  const epochId = currentEpoch(epochs)?.id ?? '';
  const { key, rows } = await cohortRowsWithFallback(deps, settings, epochId, cohortKeyOf(issueClass, 'nature-zone-size'));
  const agentRow = rows.find((row) => row.arm === 'agent');
  const humanRow = rows.find((row) => row.arm === 'human');
  return buildCard(deps, settings, issueId, issueClass, key, epochId, agentRow ?? null, humanRow ?? null, facts);
}

/** Assembles the card with the frozen L4 rules (SPEC §8). */
async function buildCard(
  deps: Deps,
  settings: ProjectSettings,
  issueId: string,
  issueClass: IssueClass,
  key: CohortKey,
  epochId: string,
  agentRow: CohortStat | null,
  humanRow: CohortStat | null,
  facts: ProjectFacts,
): Promise<RecommendationCard> {
  const agent = agentRow !== null && agentRow.clean.n > 0 ? agentRow.clean : null;
  const human = humanRow !== null && humanRow.clean.n > 0 ? humanRow.clean : null;
  const conclusion = agentRow?.conclusion ?? humanRow?.conclusion ?? 'not-enough-data';
  const balance = balanceOfConclusion(conclusion !== 'not-enough-data');
  const ticket = await deps.jira.getTicket(issueId);
  const incidents = facts.outcomes.get(issueId)?.incidents ?? 0;
  const fired = guardrails(incidents > 0, issueClass.zone, settings.sensitiveZones, hasAcceptanceCriteria(ticket?.description ?? null));
  const agentLead = agentRow !== null && agentRow.clean.n > 0 ? { n: agentRow.clean.n, medianH: agentRow.medianLeadH } : null;
  const humanLead = humanRow !== null && humanRow.clean.n > 0 ? { n: humanRow.clean.n, medianH: humanRow.medianLeadH } : null;
  const delayBetter = agentLead !== null && humanLead !== null && agentLead.medianH < humanLead.medianH;
  const value = recommendFrom(conclusion, balance, fired, delayBetter);
  const confidence = confidenceOf(agent, human, conclusion);
  return {
    issueId,
    issueKey: ticket?.key ?? issueId,
    value,
    cohort: key,
    epochId,
    agent,
    human,
    agentLeadTime: agentLead,
    humanLeadTime: humanLead,
    conclusion,
    balance,
    confidence,
    reasons: bilingualReasons(conclusion, confidence, fired, agent, human, agentLead, humanLead),
    conditions: [...conditionsFor(value, settings)],
    guardrails: fired,
    referenceIssueKeys: await referenceKeys(deps, key, facts),
    failureCauses: [], // no comment store yet: absent data stays [] (SPEC §20)
    demo: settings.demo,
    computedAt: deps.clock.now(),
  };
}

/** Rebuilds the cards of the stale matured tickets (DP-18 slice). */
export async function recomputeRecommendations(
  deps: Deps,
  settings: ProjectSettings,
  stale: readonly Outcome[],
  facts: ProjectFacts,
): Promise<number> {
  let saved = 0;
  for (const outcome of stale) {
    const card = await cardForIssue(deps, settings, outcome.issueId, facts);
    if (card === null) continue;
    await deps.stores.recommendation.save(card);
    saved += 1;
  }
  return saved;
}

/** The judgeable outcomes whose card is missing or older than the maturity. */
export async function staleMatured(deps: Deps, facts: ProjectFacts, now: string): Promise<Outcome[]> {
  const matured = judgeable([...facts.outcomes.values()], now).slice(0, STALE_SCAN_LIMIT);
  const stale: Outcome[] = [];
  for (const outcome of matured) {
    const card = await deps.engine.read(outcome.issueId);
    if (card === null || card.computedAt < outcome.matureAt) stale.push(outcome);
    if (stale.length >= RECOMPUTE_SLICE) break;
  }
  return stale;
}
