/**
 * The reference database, loaded in the in-memory SQL engine — SPEC §18; DP-20.
 *
 * `baseStore()` fills the tables of SPEC §18 with the material of the base: the
 * facts come from `src/sample/`, the cohort statistics from the product's own
 * `recomputeCohorts`, the calibration from `recomputeCalibration` and the
 * cards from `cardForIssue`. Every read a test does then goes through the real
 * stores and the real SQL statements — no hand-written fake, no network, no
 * clock.
 *
 * The row shapes are the repository's own mappers (`src/db/mapping-*.ts`), so a
 * seeded row is exactly the row the app writes.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../../src/deps.js';
import { buildDeps, inertLlm } from '../../src/deps.js';
import { createStubRepository } from '../../src/db/stub.js';
import type { Stores } from '../../src/db/stores.js';
import type { MemorySql } from '../../src/db/memory-sql.js';
import type { JiraTicketSummary, StatusHistory } from '../../src/types-graph.js';
import type { GraphCommit, GraphPullRequest, GraphReviewer } from '../../src/types-graph.js';
import type { Clock, Logger } from '../../src/ports.js';
import { cardForIssue, recomputeCalibration, recomputeCohorts } from '../../src/handlers/recompute.js';
import { toInvolvementRow, toSignaturePatternRow } from '../../src/db/mapping-involvement.js';
import { toCommitFactRow, toOutcomeRow, toReviewFactRow } from '../../src/db/mapping-outcome.js';
import { toIssueClassRow, toEpochRow } from '../../src/db/mapping-stats.js';
import { toTrialRow, toTrialAssignmentRow } from '../../src/db/mapping-advice.js';
import type { MemoryRow } from '../../src/db/memory-sql.js';
import { base, baseFacts, BASE_NOW, BASE_PROJECT_ID } from './base-facts.js';

/** The store of the base: the tables of SPEC §18, filled with the base's material. */
export type Store = Stores;

/** The clock of the base: the reference date of the dataset (SPEC §24.1). */
export const BASE_CLOCK: Clock = { now: () => BASE_NOW };

/** The logger of the base: it keeps the entries, it never prints them. */
export function baseLogger(): Logger & { readonly entries: string[] } {
  const entries: string[] = [];
  return {
    entries,
    log: (level, message) => {
      entries.push(`${level}: ${message}`);
    },
  };
}

let cached: Promise<Store> | undefined;

/** The base, loaded in the SQL memory of the repository; loaded once. */
export function baseStore(): Promise<Store> {
  if (cached === undefined) cached = chargerBase();
  return cached;
}

/** A fresh store, loaded the same way: for the tests that write (SPEC §15). */
export function baseStoreFrais(): Promise<Store> {
  return chargerBase();
}

/** Loads the whole base into a fresh in-memory repository. */
async function chargerBase(): Promise<Store> {
  const repository = await createStubRepository();
  const current = base();
  seedFacts(repository.sql, current);
  await seedSettings(repository.stores, current);
  const deps = depsOf(repository.stores);
  const facts = baseFacts();
  await recomputeCohorts(deps, current.settings, facts);
  await seedCards(repository.stores, deps, facts);
  await recomputeCalibration(deps, current.settings, facts);
  return repository.stores;
}

/** The facts of the base, written with the repository's own row mappers. */
function seedFacts(sql: MemorySql, current: ReturnType<typeof base>): void {
  sql.seed('involvement', asRows(current.involvements, toInvolvementRow));
  sql.seed('signature_pattern', asRows(current.patterns, toSignaturePatternRow));
  sql.seed('commit_fact', asRows(current.commitFacts, toCommitFactRow));
  sql.seed('review_fact', asRows(current.reviewFacts, toReviewFactRow));
  sql.seed('outcome', asRows(current.outcomes, toOutcomeRow));
  sql.seed('issue_class', asRows(current.classes, toIssueClassRow));
  sql.seed('epoch', asRows(current.epochs, toEpochRow));
  sql.seed('trial', asRows([current.trial], toTrialRow));
  sql.seed('trial_assignment', asRows(current.trialAssignments, toTrialAssignmentRow));
}

/** Maps domain rows into plain rows the engine accepts (test seeding). */
function asRows<T, R>(items: readonly T[], mapper: (item: T) => R): readonly MemoryRow[] {
  return items.map((item) => ({ ...(mapper(item) as object) }) as MemoryRow);
}

/** The settings and the coverage of the base, written through the stores. */
async function seedSettings(stores: Stores, current: ReturnType<typeof base>): Promise<void> {
  await stores.settings.save(current.settings);
  await stores.coverage.save(current.coverage);
}

/** The cards of the base, computed by the product for every matured ticket. */
async function seedCards(stores: Stores, deps: Deps, facts: ReturnType<typeof baseFacts>): Promise<void> {
  for (const outcome of facts.outcomes.values()) {
    if (outcome.matureAt === '' || outcome.matureAt > BASE_NOW) continue;
    const card = await cardForIssue(deps, base().settings, outcome.issueId, facts);
    if (card !== null) await stores.recommendation.save(card);
  }
}

/** The dependencies of a store: the stores, with the gateways of the base. */
function depsOf(stores: Stores): Deps {
  return {
    stores,
    jira: jiraDe(),
    graph: graphDe(),
    llm: inertLlm(),
    engine: {
      read: async (issueId: string) => stores.recommendation.get(issueId),
      compute: async (issueId: string) => stores.recommendation.get(issueId),
      map: async () => null,
    },
    settings: stores.settings,
    clock: BASE_CLOCK,
    random: { nextInt: () => 0, drawArm: () => 'human' },
    logger: baseLogger(),
    ids: { next: (prefix: string) => `${prefix}-base` },
  };
}

/** The Jira of the base: the tickets of the dataset, by id or by key. */
function jiraDe(): Deps['jira'] {
  const current = base();
  const byId = new Map(current.jira.map((ticket) => [ticket.id, ticket]));
  const byKey = new Map(current.jira.map((ticket) => [ticket.key, ticket]));
  const histories = new Map(current.histories.map((history) => [history.issueId, history]));
  return {
    getTicket: async (idOrKey: string) => byId.get(idOrKey) ?? byKey.get(idOrKey) ?? null,
    searchJql: async (_jql: string, limit: number) => current.jira.slice(0, limit).map(summaryOf),
    statusHistory: async (issueId: string): Promise<StatusHistory> =>
      histories.get(issueId) ?? { issueId, changes: [], closed: false, closedStatus: '' },
    links: async (issueId: string) => current.links.filter((link) => link.issueId === issueId),
    components: async (issueId: string) => [...(byId.get(issueId)?.components ?? [])],
    labels: async (issueId: string) => [...(byId.get(issueId)?.labels ?? [])],
    descriptionAdf: async (issueId: string) => byId.get(issueId)?.description ?? null,
    readCustomField: async (issueId: string, fieldId: string) =>
      byId.get(issueId)?.customFields[fieldId] ?? '',
    writeCustomField: async () => true,
    sprintIssues: async (sprintId: string, limit: number) =>
      current.jira.filter((ticket) => ticket.sprintId === sprintId).slice(0, limit).map(summaryOf),
  };
}

/** One ticket of the base, as a search result (SPEC §15). */
function summaryOf(ticket: ReturnType<typeof base>['jira'][number]): JiraTicketSummary {
  return {
    id: ticket.id,
    key: ticket.key,
    summary: ticket.summary,
    status: ticket.status,
    storyPoints: ticket.storyPoints,
  };
}

/** The graph of the base: the commits of the dataset, with their mention. */
function graphDe(): Deps['graph'] {
  const current = base();
  const byIssue = new Map<string, import('../../src/types.js').CommitFact[]>();
  for (const fact of current.commitFacts) {
    const list = byIssue.get(fact.issueId);
    if (list === undefined) byIssue.set(fact.issueId, [fact]);
    else list.push(fact);
  }
  return {
    commitsOfIssue: async (issueId: string): Promise<GraphCommit[]> =>
      (byIssue.get(issueId) ?? []).map((fact) => ({
        ref: fact.commitRef,
        hash: fact.commitRef,
        message: fact.hasSignature ? 'Co-authored-by: Claude Code' : 'mise à jour du code',
        authorIsBot: fact.authorIsBot,
        authorAccountId: fact.authorIsBot ? 'agent-bot-1' : 'dev-1',
        committedAt: fact.committedAt,
        repository: 'demo',
        url: `https://graph.example/commit/${fact.commitRef}`,
      })),
    pullRequestsOfCommit: async (_commitRef: string): Promise<GraphPullRequest[]> => [],
    reviewersOfPullRequest: async (_prRef: string): Promise<GraphReviewer[]> => [],
    commentCountOfPullRequest: async () => 0,
    botAccount: async () => false,
    permission: async () => 'granted',
    probePermission: async (objectType) => ({ objectType, state: 'granted', testedAt: BASE_NOW }),
  };
}

/** The dependencies of the base, with its gateways and its fixed clock. */
export async function baseDeps(): Promise<Deps> {
  const stores = await baseStore();
  return buildDeps({
    stores,
    jira: jiraDe(),
    graph: graphDe(),
    llm: inertLlm(),
    clock: BASE_CLOCK,
    logger: baseLogger(),
  });
}

/** The dependencies of a fresh base, for the tests that write (SPEC §15). */
export async function baseDepsFrais(): Promise<Deps> {
  const stores = await baseStoreFrais();
  return buildDeps({
    stores,
    jira: jiraDe(),
    graph: graphDe(),
    llm: inertLlm(),
    clock: BASE_CLOCK,
    logger: baseLogger(),
  });
}

/** The project of the base, as the tools address it (SPEC §15). */
export const BASE_PROJECT_KEY = base().settings.projectKey;

/** The identifiers the base uses: `PROJ-412` and its internal id. */
export function idsDe(key: string): { readonly id: string; readonly key: string } {
  const ticket = base().tickets.find((item) => item.key === key);
  if (ticket === undefined) throw new Error(`base: unknown ticket ${key}`);
  return { id: ticket.id, key: ticket.key };
}

/** The project id the base stores its rows under (SPEC §18). */
export const BASE_ID = BASE_PROJECT_ID;
