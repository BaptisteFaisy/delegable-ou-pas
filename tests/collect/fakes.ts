/**
 * Fakes de passerelle et d'horloge pour les tests de collecte (SPEC §17).
 * Aucun réseau : les passerelles Jira et Graphe sont des bouchons déterministes.
 * Règle : fichiers < 500 lignes, fonctions < 50 lignes.
 */
import type { Clock, GraphGateway, JiraGateway } from '../../src/ports.js';
import type { HttpResponse } from '../../src/collect/http.js';
import type {
  GraphCommit,
  GraphPullRequest,
  GraphReviewer,
  JiraTicketSummary,
} from '../../src/types-graph.js';
import type {
  GraphObjectType,
  GraphPermission,
  GraphPermissionState,
} from '../../src/types.js';

/* ------------------------------------------------------------------ horloge */

export interface FakeClock extends Clock {
  advance(iso: string): void;
}

export function fakeClock(start = '2026-11-01T00:00:00.000Z'): FakeClock {
  let current = start;
  return { now: () => current, advance: (iso) => { current = iso; } };
}

/* ------------------------------------------------------------- objets graphe */

export function commit(ref: string, message: string, extra: Partial<GraphCommit> = {}): GraphCommit {
  return {
    ref,
    hash: `hash-${ref}`,
    message,
    authorIsBot: false,
    authorAccountId: `acct-${ref}`,
    committedAt: '2026-10-01T10:00:00.000Z',
    repository: 'repo',
    url: `https://example.invalid/${ref}`,
    ...extra,
  };
}

export function reviewer(accountId: string, verdict: GraphReviewer['verdict']): GraphReviewer {
  return { accountId, verdict };
}

export function pullRequest(ref: string, extra: Partial<GraphPullRequest> = {}): GraphPullRequest {
  return {
    ref,
    state: 'merged',
    reviewers: [],
    commentCount: 0,
    commitsAfterOpen: 0,
    openedAt: '2026-10-01T09:00:00.000Z',
    mergedAt: '2026-10-02T09:00:00.000Z',
    authorAccountId: `author-${ref}`,
    ...extra,
  };
}

/* -------------------------------------------------------------- graphe fake */

export interface FakeGraphOptions {
  commits?: Record<string, GraphCommit[]>;
  pullRequests?: Record<string, GraphPullRequest[]>;
  permission?: GraphPermissionState;
  probe?: GraphPermissionState;
  botAccounts?: readonly string[];
}

export interface FakeGraph extends GraphGateway {
  readonly calls: string[];
}

export function fakeGraph(options: FakeGraphOptions = {}): FakeGraph {
  const calls: string[] = [];
  const commits = options.commits ?? {};
  const pullRequests = options.pullRequests ?? {};
  const permission = options.permission ?? 'granted';
  const probe = options.probe ?? 'granted';
  const bots = new Set(options.botAccounts ?? []);
  const prByRef = new Map<string, GraphPullRequest>();
  for (const list of Object.values(pullRequests)) {
    for (const pr of list) prByRef.set(pr.ref, pr);
  }

  return {
    calls,
    commitsOfIssue: async (issueId) => {
      calls.push(`commitsOfIssue:${issueId}`);
      return commits[issueId] ?? [];
    },
    pullRequestsOfCommit: async (commitRef) => {
      calls.push(`pullRequestsOfCommit:${commitRef}`);
      return pullRequests[commitRef] ?? [];
    },
    reviewersOfPullRequest: async (prRef) => [...(prByRef.get(prRef)?.reviewers ?? [])],
    commentCountOfPullRequest: async (prRef) => prByRef.get(prRef)?.commentCount ?? 0,
    botAccount: async (accountId) => bots.has(accountId),
    permission: async () => permission,
    probePermission: async (objectType): Promise<GraphPermission> => ({
      objectType,
      state: probe,
      testedAt: '2026-11-01T00:00:00.000Z',
    }),
  };
}

/* --------------------------------------------------------------- jira fake */

export function summary(key: string, extra: Partial<JiraTicketSummary> = {}): JiraTicketSummary {
  return { id: key, key, summary: `Ticket ${key}`, status: 'Done', storyPoints: null, ...extra };
}

/**
 * Passerelle Jira complète en bouchon : `searchJql` applique la clause de
 * reprise `key > "..."` (DP-18) ; les autres membres rendent la valeur « donnée
 * absente » du contrat (`null` / `[]` / `''` / `false`, SPEC §20).
 */
export function fakeJira(keys: readonly string[]): JiraGateway {
  return {
    getTicket: async () => null,
    searchJql: async (jql, limit) => {
      const match = /key > "([^"]+)"/.exec(jql);
      const after = match?.[1] ?? '';
      const eligible = after === '' ? [...keys] : keys.filter((key) => key > after);
      return eligible.slice(0, limit).map((key) => summary(key));
    },
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

/* ---------------------------------------------------- transport Jira (HTTP) */

export function jsonResponse(body: unknown, ok = true, status = 200): HttpResponse {
  return { ok, status, json: async () => body };
}

export type RouteHandler = (path: string, init?: unknown) => Promise<HttpResponse>;

/** Construit un `requestJira` fake qui répond selon le chemin de la route. */
export function fakeRequestJira(routes: Record<string, unknown>): RouteHandler {
  return async (route) => {
    const path = typeof route === 'string' ? route : (route as { value?: string }).value ?? '';
    for (const [prefix, body] of Object.entries(routes)) {
      if (path.startsWith(prefix)) return jsonResponse(body);
    }
    return jsonResponse(null, false, 404);
  };
}

export const OBJECT_TYPES: readonly GraphObjectType[] = ['commit', 'pull-request', 'issue', 'user'];