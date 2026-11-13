/**
 * The dependency graph of the app — SPEC §17, §19, §20; DP-15, DP-18, DP-20.
 *
 * One single assembly point: every handler and every MCP tool receives `Deps`
 * and nothing instantiates a store, a gateway or a clock anywhere else. That
 * is what makes the whole decision path testable without Forge: the tests and
 * the demo mode (DP-20) pass fakes or the in-memory repository, production
 * passes the Forge ones.
 *
 * No `@forge/*` import lives at the top level here: the Forge packages are
 * pulled through dynamic imports inside `buildForgeParts`, so importing this
 * module never touches the network (SPEC §17).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { GraphGateway, JiraGateway, LlmGateway, RecommendationEngine } from './ports.js';
import type { Clock, IdGenerator, Logger, Randomness } from './ports.js';
import type { SettingsStore } from './ports.js';
import type { Stores } from './db/stores.js';
import { createRecommendationEngine } from './domain/recommendation.js';

/** Everything a handler needs, injected — the frozen shape of docs/CONTRACTS.md §6. */
export interface Deps {
  readonly stores: Stores;
  readonly jira: JiraGateway;
  readonly graph: GraphGateway;
  readonly llm: LlmGateway;
  readonly engine: RecommendationEngine;
  readonly settings: SettingsStore;
  readonly clock: Clock;
  readonly random: Randomness;
  readonly logger: Logger;
  readonly ids: IdGenerator;
}

/**
 * What `buildDeps` accepts as `runtime`: the Forge API instance in production,
 * or an object carrying overrides (tests, demo mode). `unknown` in the frozen
 * signature, inspected here — absent parts are built, provided parts are kept.
 */
export interface DepsOverrides {
  readonly stores?: Stores;
  readonly jira?: JiraGateway;
  readonly graph?: GraphGateway;
  readonly llm?: LlmGateway;
  readonly engine?: RecommendationEngine;
  readonly clock?: Clock;
  readonly random?: Randomness;
  readonly logger?: Logger;
  readonly ids?: IdGenerator;
  /** Demo switch (SPEC §13, DP-20): in-memory repository, inert gateways. */
  readonly demo?: boolean;
}

/* ------------------------------------------------------------- primitives */

/** The production clock: the only wall clock of the runtime side (SPEC §17). */
export function systemClock(): Clock {
  return { now: () => new Date().toISOString() };
}

/** The console logger; metadata is passed through, never a person (DP-17). */
export function consoleLogger(): Logger {
  return {
    log: (level, message, meta) => {
      if (level === 'error') console.error(message, meta ?? '');
      else if (level === 'warn') console.warn(message, meta ?? '');
      else console.log(message, meta ?? '');
    },
  };
}

/** FNV-1a: a small deterministic hash, so a seed always draws the same arm. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Reproducible randomness: the same seed never changes a draw (SPEC §11). */
export function seededRandom(): Randomness {
  return {
    nextInt: (seed, maxExclusive) => (maxExclusive <= 0 ? 0 : hashSeed(seed) % maxExclusive),
    drawArm: (seed, issueId) => (hashSeed(`${seed}:${issueId}`) % 2 === 0 ? 'agent' : 'human'),
  };
}

/** Counting identifiers, prefixed; deterministic inside one runtime. */
export function counterIds(start = 1): IdGenerator {
  let count = start;
  return { next: (prefix) => `${prefix}-${count++}` };
}

/* ------------------------------------------------------------ inert parts */

/**
 * Gateways that answer "nothing here" to everything: the demo mode (DP-20) and
 * the offline tests run on them, so absent data stays normal — `null` / `[]`,
 * never an exception (SPEC §20).
 */
export function inertJira(): JiraGateway {
  return {
    getTicket: async () => null,
    searchJql: async () => [],
    statusHistory: async (issueId) => ({ issueId, changes: [], closed: false, closedStatus: '' }),
    links: async () => [],
    components: async () => [],
    labels: async () => [],
    descriptionAdf: async () => null,
    readCustomField: async () => '',
    writeCustomField: async () => false,
    sprintIssues: async () => [],
  };
}

export function inertGraph(): GraphGateway {
  return {
    commitsOfIssue: async () => [],
    pullRequestsOfCommit: async () => [],
    reviewersOfPullRequest: async () => [],
    commentCountOfPullRequest: async () => 0,
    botAccount: async () => false,
    permission: async () => 'unknown',
    probePermission: async (objectType) => ({ objectType, state: 'unknown', testedAt: '' }),
  };
}

export function inertLlm(): LlmGateway {
  return {
    classifyNature: async (_text, natures) => ({
      nature: natures[0] ?? 'no-code',
      rationale: 'demo mode / mode démonstration',
    }),
    summarizeFailureCauses: async () => [],
  };
}

/* -------------------------------------------------------------- assembly */

function asOverrides(runtime: unknown): DepsOverrides {
  if (runtime === null || typeof runtime !== 'object') return {};
  return runtime as DepsOverrides;
}

/** The recommendation engine, wired on the stores — the single path (L4). */
export function buildEngine(stores: Stores, clock: Clock): RecommendationEngine {
  return createRecommendationEngine({
    settings: stores.settings,
    epochs: stores.epoch,
    cohorts: stores.cohortStat,
    classes: stores.issueClass,
    outcomes: stores.outcome,
    involvements: stores.involvement,
    recommendations: stores.recommendation,
    decisions: stores.decision,
    reviews: stores.reviewFact,
    clock,
  });
}

/** The Forge parts, pulled through dynamic imports only (SPEC §17). */
async function buildForgeParts(demo: boolean): Promise<{ stores: Stores; jira: JiraGateway; graph: GraphGateway; llm: LlmGateway }> {
  if (demo) {
    const { createStubRepository } = await import('./db/stub.js');
    const stub = await createStubRepository();
    return { stores: stub.stores, jira: inertJira(), graph: inertGraph(), llm: inertLlm() };
  }
  const [{ createForgeRepository }, { createJiraGateway }, { createGraphGateway }, { createLlmGateway }] =
    await Promise.all([
      import('./db/repo.js'),
      import('./collect/jira.js'),
      import('./collect/graph.js'),
      import('./collect/llm.js'),
    ]);
  let api: unknown = null;
  try {
    const forgeApi = (await import('@forge/api')) as { api?: unknown; default?: unknown };
    api = forgeApi.api ?? forgeApi.default ?? null;
  } catch {
    api = null; // absent runtime: the gateways degrade to "no data" (SPEC §20)
  }
  const stores = await createForgeRepository();
  return {
    stores,
    jira: createJiraGateway(api),
    graph: createGraphGateway(api),
    llm: createLlmGateway(null),
  };
}

/**
 * Builds the whole graph once. `runtime` is the Forge API in production; the
 * tests and the demo mode pass overrides (DP-20: `{ demo: true }` swaps the
 * real gateways for the in-memory repository the sample dataset seeds).
 */
export async function buildDeps(runtime: unknown): Promise<Deps> {
  const overrides = asOverrides(runtime);
  const clock = overrides.clock ?? systemClock();
  const needsForge =
    overrides.stores === undefined ||
    overrides.jira === undefined ||
    overrides.graph === undefined ||
    overrides.llm === undefined;
  const built = needsForge ? await buildForgeParts(overrides.demo === true) : null;
  const stores = overrides.stores ?? built?.stores ?? (await (await import('./db/stub.js')).createStubRepository()).stores;
  return {
    stores,
    jira: overrides.jira ?? built?.jira ?? inertJira(),
    graph: overrides.graph ?? built?.graph ?? inertGraph(),
    llm: overrides.llm ?? built?.llm ?? inertLlm(),
    engine: overrides.engine ?? buildEngine(stores, clock),
    settings: stores.settings,
    clock,
    random: overrides.random ?? seededRandom(),
    logger: overrides.logger ?? consoleLogger(),
    ids: overrides.ids ?? counterIds(),
  };
}

/* ------------------------------------------------------- lazy singleton */

let shared: Promise<Deps> | null = null;

/**
 * The runtime entry points (manifest handlers) all share ONE assembly: the
 * first call builds, the next ones reuse (docs/CONTRACTS.md §6).
 */
export function getDeps(runtime: unknown = null): Promise<Deps> {
  if (shared === null) shared = buildDeps(runtime);
  return shared;
}

/** Test hook: drops the shared assembly so the next `getDeps` rebuilds. */
export function resetDeps(): void {
  shared = null;
}
