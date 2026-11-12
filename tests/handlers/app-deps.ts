/**
 * Shared fakes for the L7 tests — SPEC §17, §20; DP-15, DP-20.
 *
 * The whole app is assembled through `buildDeps` with an in-memory repository
 * (`src/db/stub.ts`) and fake gateways: no Forge, no network, a fixed clock
 * (the pattern of `tests/handlers/app-deps.ts` of the sibling app).
 */
import type { Deps, DepsOverrides } from '../../src/deps.js';
import { buildDeps, inertGraph, inertLlm } from '../../src/deps.js';
import type { Clock, GraphGateway, JiraGateway, LlmGateway, Logger } from '../../src/ports.js';
import type { IssueLink, JiraTicket, JiraTicketSummary, StatusHistory } from '../../src/types-graph.js';
import type { Stores } from '../../src/db/stores.js';
import { createStubRepository } from '../../src/db/stub.js';

/** The fixed instant of the tests (no wall clock anywhere — SPEC §17). */
export const TEST_NOW = '2027-02-01T09:00:00.000Z';

/** A mutable Jira fake: the tests seed what the gateway answers. */
export interface FakeJira extends JiraGateway {
  readonly tickets: Map<string, JiraTicket>;
  search: JiraTicketSummary[];
  sprint: JiraTicketSummary[];
  readonly histories: Map<string, StatusHistory>;
  readonly linksByIssue: Map<string, IssueLink[]>;
  readonly fields: Map<string, string>;
  readonly writes: { issueId: string; fieldId: string; value: string }[];
}

export function fakeTicket(id: string, key: string, projectId = 'PROJ'): JiraTicket {
  return {
    id,
    key,
    projectId,
    projectKey: projectId,
    summary: 'sample ticket',
    description: null,
    status: 'In Progress',
    issueType: 'Task',
    components: [],
    labels: [],
    storyPoints: null,
    sprintId: '',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    customFields: {},
  };
}

export function fakeSummary(id: string, key: string, storyPoints: number | null = null): JiraTicketSummary {
  return { id, key, summary: `summary of ${key}`, status: 'In Progress', storyPoints };
}

export function openHistory(issueId: string): StatusHistory {
  return { issueId, changes: [], closed: false, closedStatus: '' };
}

export function closedHistory(issueId: string, closedAt: string): StatusHistory {
  return {
    issueId,
    changes: [
      { from: 'À faire', to: 'In Progress', at: '2026-11-01T09:00:00.000Z' },
      { from: 'In Progress', to: 'Done', at: closedAt },
    ],
    closed: true,
    closedStatus: 'Done',
  };
}

/** Builds the mutable Jira fake; every answer comes from the seeded maps. */
export function createFakeJira(): FakeJira {
  const tickets = new Map<string, JiraTicket>();
  const histories = new Map<string, StatusHistory>();
  const linksByIssue = new Map<string, IssueLink[]>();
  const fields = new Map<string, string>();
  const writes: { issueId: string; fieldId: string; value: string }[] = [];
  const fake: FakeJira = {
    tickets,
    search: [],
    sprint: [],
    histories,
    linksByIssue,
    fields,
    writes,
    getTicket: async (idOrKey) => tickets.get(idOrKey) ?? null,
    searchJql: async (_jql, limit) => fake.search.slice(0, limit),
    statusHistory: async (issueId) => histories.get(issueId) ?? openHistory(issueId),
    links: async (issueId) => linksByIssue.get(issueId) ?? [],
    components: async () => [],
    labels: async () => [],
    descriptionAdf: async () => null,
    readCustomField: async (issueId, fieldId) => fields.get(`${issueId}:${fieldId}`) ?? '',
    writeCustomField: async (issueId, fieldId, value) => {
      writes.push({ issueId, fieldId, value });
      return true;
    },
    sprintIssues: async (_sprintId, limit) => fake.sprint.slice(0, limit),
  };
  return fake;
}

/** A clock the tests move by hand, and a logger that keeps its entries. */
export interface TestClock extends Clock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function testClock(start = TEST_NOW): TestClock {
  let current = start;
  return {
    now: () => current,
    set: (iso: string) => {
      current = iso;
    },
    advance: (ms: number) => {
      current = new Date(Date.parse(current) + ms).toISOString();
    },
  };
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
}

export function testLogger(): Logger & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    log: (level, message) => {
      entries.push({ level, message });
    },
  };
}

/** Everything a test needs to drive the app. */
export interface TestApp {
  deps: Deps;
  stores: Stores;
  jira: FakeJira;
  graph: GraphGateway;
  llm: LlmGateway;
  clock: TestClock;
  logger: Logger & { entries: LogEntry[] };
}

/** Registers a ticket under BOTH its id and its key, like Jira answers. */
export function seedTicket(jira: FakeJira, ticket: JiraTicket): void {
  jira.tickets.set(ticket.id, ticket);
  jira.tickets.set(ticket.key, ticket);
}

/** Assembles the app on the in-memory repository, with fakes everywhere. */
export async function createTestApp(overrides: DepsOverrides = {}): Promise<TestApp> {
  const stub = await createStubRepository();
  const jira = (overrides.jira as FakeJira | undefined) ?? createFakeJira();
  const clock = (overrides.clock as TestClock | undefined) ?? testClock();
  const logger = (overrides.logger as Logger & { entries: LogEntry[] }) ?? testLogger();
  const deps = await buildDeps({
    stores: stub.stores,
    jira,
    graph: overrides.graph ?? inertGraph(),
    llm: overrides.llm ?? inertLlm(),
    clock,
    logger,
    ...overrides,
  });
  return { deps, stores: stub.stores, jira, graph: deps.graph, llm: deps.llm, clock, logger };
}
