/**
 * Chain "Graphe": reads the Teamwork Graph on behalf of a signed-in user and
 * collects the facts in bounded, resumable slices (SPEC §17 "Ce qu'impose le
 * graphe", SPEC §19, DP-05, DP-18).
 *
 * Three constraints shape this module:
 * - a missing right never raises, it empties the result (SPEC §19, recipe 15);
 * - no relation links a ticket to a pull request: the path is ticket → commit,
 *   then commit → PR, then PR → reviewers (SPEC §17);
 * - the commit message is read, matched against the catalogue (L2), then dropped:
 *   only the fact (mention found or not + agent name) is stored (SPEC §17, §20).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type {
  Clock,
  CommitFactStore,
  Consumer,
  GraphCursorStore,
  GraphGateway,
  JiraGateway,
  ReviewFactStore,
  SignatureStore,
} from '../ports.js';
import type { CollectionJob } from '../ports.js';
import type { CommitFact, GraphObjectType, GraphPermissionState, ReviewFact, SignaturePattern } from '../types.js';
import type { CollectionSlice, GraphCommit, GraphPullRequest, GraphReviewer, JiraTicketSummary, PullRequestState, ReviewVerdict } from '../types-graph.js';
import { scanCommits, scanMessage } from '../domain/signatures.js';
import { reviewFact } from '../domain/review.js';
import { createHttpClient, toHttpText, HttpError } from './http.js';
import { createIdentityReader, type IdentityReader } from './identity.js';
import { planSlice, projectJql, resumeJql, resumeKey } from './graph-plan.js';

/** The Forge Teamwork Graph request function, structurally typed. */
type TeamworkRequest = (query: string, variables?: Record<string, unknown>) => Promise<unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function systemClock(): Clock {
  return { now: () => new Date().toISOString() };
}

function resolveTeamwork(api: unknown): TeamworkRequest | null {
  const a = asRecord(api);
  if (a === null) return null;
  if (typeof a['requestTeamworkGraph'] === 'function') return a['requestTeamworkGraph'] as TeamworkRequest;
  const asUser = a['asUser'];
  if (typeof asUser === 'function') {
    const scoped = asRecord((asUser as () => unknown)());
    if (scoped !== null && typeof scoped['requestTeamworkGraph'] === 'function') {
      return scoped['requestTeamworkGraph'] as TeamworkRequest;
    }
  }
  return null;
}

function resolveJiraRequest(api: unknown): ((path: string) => Promise<unknown>) | null {
  const a = asRecord(api);
  if (a === null) return null;
  if (typeof a['requestJira'] === 'function') return a['requestJira'] as (path: string) => Promise<unknown>;
  const asUser = a['asUser'];
  if (typeof asUser === 'function') {
    const scoped = asRecord((asUser as () => unknown)());
    if (scoped !== null && typeof scoped['requestJira'] === 'function') {
      return scoped['requestJira'] as (path: string) => Promise<unknown>;
    }
  }
  return null;
}

/** True when a GraphQL error denotes a missing right (SPEC §19, recipe 15). */
function isPermissionError(error: unknown): boolean {
  const record = asRecord(error);
  if (record === null) return false;
  const message = str(record['message']).toLowerCase();
  const extensions = asRecord(record['extensions']);
  const code = str(extensions?.['code']).toLowerCase();
  const denied = ['permission', 'forbidden', 'access denied', 'no access', 'unauthor', '403'];
  return denied.some((token) => message.includes(token) || code.includes(token));
}

interface GraphResult<T> {
  readonly data: T | null;
  readonly permissionDenied: boolean;
}

/** Runs one graph query through the shared client; a missing right empties it. */
async function queryGraph<T>(
  request: TeamworkRequest | null,
  label: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<GraphResult<T>> {
  if (request === null) return { data: null, permissionDenied: false };
  const client = createHttpClient();
  try {
    const body = await client.request<unknown>(`graph:${label}`, async () => toHttpText(await request(query, variables)));
    const obj = asRecord(body);
    const errors = Array.isArray(obj?.['errors']) ? (obj!['errors'] as unknown[]) : [];
    return { data: (obj?.['data'] ?? null) as T | null, permissionDenied: errors.some(isPermissionError) };
  } catch (error: unknown) {
    // A 401/403 means "no right": the result is emptied, never raised (SPEC §19).
    if (error instanceof HttpError && error.kind === 'http' && (error.status === 401 || error.status === 403)) {
      return { data: null, permissionDenied: true };
    }
    return { data: null, permissionDenied: false };
  }
}

/* ---------------------------------------------------------------- normalisers */

function normalizeVerdict(value: unknown): ReviewVerdict {
  const v = str(value).toLowerCase();
  if (v.includes('approv')) return 'approved';
  if (v.includes('change') || v.includes('request')) return 'changes-requested';
  return 'none';
}

function normalizeState(value: unknown): PullRequestState {
  const s = str(value).toLowerCase();
  if (s.includes('merg')) return 'merged';
  if (s.includes('declin') || s.includes('clos') || s.includes('reject')) return 'declined';
  if (s.includes('draft')) return 'draft';
  return 'open';
}

function normalizeReviewer(value: unknown): GraphReviewer | null {
  const record = asRecord(value);
  if (record === null) return null;
  const accountId = str(record['accountId']) || str(record['id']);
  if (accountId === '') return null;
  return { accountId, verdict: normalizeVerdict(record['verdict'] ?? record['status'] ?? record['state']) };
}

function normalizeReviewers(value: unknown): GraphReviewer[] {
  if (!Array.isArray(value)) return [];
  const result: GraphReviewer[] = [];
  for (const item of value) {
    const reviewer = normalizeReviewer(item);
    if (reviewer !== null) result.push(reviewer);
  }
  return result;
}

function normalizeCommit(value: unknown, botOf: (accountId: string) => boolean): GraphCommit | null {
  const record = asRecord(value);
  if (record === null) return null;
  const author = asRecord(record['author']);
  const accountId = str(author?.['accountId']) || str(record['authorAccountId']) || str(record['author']);
  return {
    ref: str(record['ref']) || str(record['id']) || str(record['oid']),
    hash: str(record['hash']) || str(record['oid']) || str(record['sha']),
    message: str(record['message']),
    authorIsBot: botOf(accountId),
    authorAccountId: accountId,
    committedAt: str(record['committedAt']) || str(record['authoredAt']) || str(record['createdAt']),
    repository: str(asRecord(record['repository'])?.['name']) || str(record['repository']),
    url: str(record['url']) || str(record['href']) || str(record['address']),
  };
}

function normalizePullRequest(value: unknown): GraphPullRequest | null {
  const record = asRecord(value);
  if (record === null) return null;
  const author = asRecord(record['author']);
  return {
    ref: str(record['ref']) || str(record['id']),
    state: normalizeState(record['state'] ?? record['status']),
    reviewers: normalizeReviewers(record['reviewers']),
    commentCount: num(record['commentCount']),
    commitsAfterOpen: num(record['commitsAfterOpen']),
    openedAt: str(record['openedAt']) || str(record['createdAt']),
    mergedAt: str(record['mergedAt']),
    authorAccountId: str(author?.['accountId']) || str(record['authorAccountId']),
  };
}

function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/* --------------------------------------------------------------- the gateway */

const COMMITS_QUERY = `query CommitsOfIssue($issueId: String!) {
  issue(id: $issueId) { commits { id hash message committedAt url repository { name } author { accountId accountType displayName } } }
}`;

const PULL_REQUESTS_QUERY = `query PullRequestsOfCommit($commitRef: String!) {
  commit(id: $commitRef) { pullRequests { id state openedAt mergedAt commentCount commitsAfterOpen author { accountId } } }
}`;

const REVIEWERS_QUERY = `query ReviewersOfPullRequest($prRef: String!) {
  pullRequest(id: $prRef) { reviewers { accountId verdict } }
}`;

const COMMENT_COUNT_QUERY = `query CommentCountOfPullRequest($prRef: String!) {
  pullRequest(id: $prRef) { commentCount }
}`;

const ISSUE_QUERY = `query IssueNode($issueId: String!) { issue(id: $issueId) { id key } }`;

const ACCOUNT_QUERY = `query AccountNode($accountId: String!) {
  account(id: $accountId) { isBot accountType displayName }
}`;

/** Builds the `GraphGateway` adapter (SPEC §17, SPEC §19). */
export function createGraphGateway(api: unknown, clock: Clock = systemClock()): GraphGateway {
  const teamwork = resolveTeamwork(api);
  const jiraRequest = resolveJiraRequest(api);
  const identity: IdentityReader = createIdentityReader(async (accountId) => {
    const fromGraph = await accountFromGraph(accountId);
    if (fromGraph !== null) return fromGraph;
    return await accountFromJira(accountId);
  });
  // Synchronous placeholder: the real bot verdict comes from `identity.isBot`
  // (async, cached there), which overrides `authorIsBot` before any storage.
  const botOf = (): boolean => false;

  /** Reads the account record off the graph (SPEC §19: no direct Jira need). */
  async function accountFromGraph(accountId: string): Promise<Record<string, unknown> | null> {
    const result = await queryGraph<{ account?: unknown }>(teamwork, 'account', ACCOUNT_QUERY, { accountId });
    return asRecord(result.data?.account);
  }

  /** Fallback: the Jira REST user record, `null` when unavailable (SPEC §20). */
  async function accountFromJira(accountId: string): Promise<unknown> {
    if (jiraRequest === null) return null;
    try {
      return await createHttpClient().request<unknown>(
        `jira:user:${accountId}`,
        async () => toHttpText(await jiraRequest(`/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`)),
      );
    } catch {
      return null;
    }
  }

  async function commitsOfIssue(issueId: string): Promise<GraphCommit[]> {
    const result = await queryGraph<{ issue?: { commits?: unknown } }>(teamwork, 'commits', COMMITS_QUERY, { issueId });
    if (result.data === null) return [];
    const commits = listOf<unknown>(result.data.issue?.commits);
    const normalized: GraphCommit[] = [];
    for (const raw of commits) {
      const commit = normalizeCommit(raw, botOf);
      if (commit !== null) {
        commit.authorIsBot = await identity.isBot(commit.authorAccountId);
        normalized.push(commit);
      }
    }
    return normalized;
  }

  async function pullRequestsOfCommit(commitRef: string): Promise<GraphPullRequest[]> {
    const result = await queryGraph<{ commit?: { pullRequests?: unknown } }>(teamwork, 'prs', PULL_REQUESTS_QUERY, { commitRef });
    if (result.data === null) return [];
    const prs = listOf<unknown>(result.data.commit?.pullRequests);
    const normalized: GraphPullRequest[] = [];
    for (const raw of prs) {
      const pr = normalizePullRequest(raw);
      if (pr !== null) normalized.push(pr);
    }
    return normalized;
  }

  async function detectState(objectType: GraphObjectType, knownIssueId: string): Promise<GraphPermissionState> {
    if (objectType === 'commit' || objectType === 'issue') {
      const query = objectType === 'issue' ? ISSUE_QUERY : COMMITS_QUERY;
      const label = objectType === 'issue' ? 'issue-probe' : 'commit-probe';
      const result = await queryGraph<unknown>(teamwork, label, query, { issueId: knownIssueId });
      return result.permissionDenied ? 'missing' : result.data !== null ? 'granted' : 'unknown';
    }
    if (objectType === 'pull-request') {
      const commits = await commitsOfIssue(knownIssueId);
      if (commits.length === 0) return 'unknown';
      const result = await queryGraph<unknown>(teamwork, 'pr-probe', PULL_REQUESTS_QUERY, { commitRef: commits[0].ref });
      return result.permissionDenied ? 'missing' : result.data !== null ? 'granted' : 'unknown';
    }
    const commits = await commitsOfIssue(knownIssueId);
    if (commits.length === 0) return 'unknown';
    const bot = await identity.isBot(commits[0].authorAccountId);
    return typeof bot === 'boolean' ? 'granted' : 'unknown';
  }

  return {
    commitsOfIssue,
    pullRequestsOfCommit,
    reviewersOfPullRequest: async (prRef) => {
      const result = await queryGraph<{ pullRequest?: { reviewers?: unknown } }>(teamwork, 'reviewers', REVIEWERS_QUERY, { prRef });
      return result.data === null ? [] : normalizeReviewers(result.data.pullRequest?.reviewers);
    },
    commentCountOfPullRequest: async (prRef) => {
      const result = await queryGraph<{ pullRequest?: { commentCount?: unknown } }>(teamwork, 'comments', COMMENT_COUNT_QUERY, { prRef });
      return result.data === null ? 0 : num(result.data.pullRequest?.commentCount);
    },
    botAccount: (accountId) => identity.isBot(accountId),
    permission: async (objectType) => detectState(objectType, ''),
    probePermission: async (objectType, knownIssueId) => ({
      objectType,
      state: await detectState(objectType, knownIssueId),
      testedAt: clock.now(),
    }),
  };
}

/* ---------------------------------------------------------------- the collector */

export interface CollectorDeps {
  readonly graph: GraphGateway;
  readonly jira: JiraGateway;
  readonly signatures: SignatureStore;
  readonly commits: CommitFactStore;
  readonly reviews: ReviewFactStore;
  readonly cursors: GraphCursorStore;
  readonly clock: Clock;
}

/** Fetches one window of candidates, over-fetching by one so `complete` is known (DP-18). */
async function fetchWindow(deps: CollectorDeps, job: CollectionJob, fromIssueId: string): Promise<JiraTicketSummary[]> {
  const limit = Math.max(0, job.sliceSize) + 1;
  if (fromIssueId === '') return deps.jira.searchJql(projectJql(job.projectId), limit);
  const ticket = await deps.jira.getTicket(fromIssueId);
  const jql = ticket === null ? projectJql(job.projectId) : resumeJql(job.projectId, ticket.key);
  return deps.jira.searchJql(jql, limit);
}

/** The emptied slice returned when a right is missing (SPEC §19, recipe 15). */
function emptiedSlice(job: CollectionJob, fromIssueId: string, startedAt: string, finishedAt: string): CollectionSlice {
  return {
    projectId: job.projectId,
    objectType: job.objectType,
    issueIds: [],
    lastIssueId: fromIssueId,
    startedAt,
    finishedAt,
    complete: true,
  };
}

async function collectTicket(
  deps: CollectorDeps,
  issueId: string,
  patterns: readonly SignaturePattern[],
): Promise<void> {
  const commits = await deps.graph.commitsOfIssue(issueId);
  const commitFacts: CommitFact[] = [];
  for (const commit of commits) {
    const match = scanMessage({ message: commit.message, patterns });
    commitFacts.push({
      issueId,
      commitRef: commit.ref,
      hasSignature: match.found,
      agentName: match.agentName,
      authorIsBot: commit.authorIsBot,
      committedAt: commit.committedAt,
    });
  }
  await deps.commits.saveMany(commitFacts);
  const scan = scanCommits(commits, patterns);
  for (const seen of scan.seen) await deps.signatures.recordSeen(seen.patternId, seen.lastSeenAt);
  await collectPullRequests(deps, issueId, commits);
}

async function collectPullRequests(
  deps: CollectorDeps,
  issueId: string,
  commits: readonly GraphCommit[],
): Promise<void> {
  const reviewFacts: ReviewFact[] = [];
  const seenPrs = new Set<string>();
  for (const commit of commits) {
    const prs = await deps.graph.pullRequestsOfCommit(commit.ref);
    for (const pr of prs) {
      if (seenPrs.has(pr.ref)) continue;
      seenPrs.add(pr.ref);
      const reviewers = await deps.graph.reviewersOfPullRequest(pr.ref);
      const commentCount = await deps.graph.commentCountOfPullRequest(pr.ref);
      reviewFacts.push(reviewFact(issueId, { ...pr, reviewers, commentCount }));
    }
  }
  await deps.reviews.saveMany(reviewFacts);
}

/** Builds the slice consumer: works one slice, stores facts, moves the cursor (DP-18). */
export function createCollector(deps: CollectorDeps): Consumer {
  return {
    handle: async (job: CollectionJob): Promise<CollectionSlice> => {
      const startedAt = deps.clock.now();
      const stored = await deps.cursors.get(job.projectId, job.objectType);
      const fromIssueId = resumeKey(job.fromIssueId, stored?.lastIssueId ?? '');
      // A missing right empties the result instead of raising (SPEC §19, recipe 15).
      if ((await deps.graph.permission(job.objectType)) === 'missing') {
        return emptiedSlice(job, fromIssueId, startedAt, deps.clock.now());
      }
      const patterns = await deps.signatures.listEnabled();
      const window = await fetchWindow(deps, job, fromIssueId);
      const plan = planSlice(
        window.map((summary) => summary.id),
        fromIssueId,
        job.sliceSize,
      );
      for (const issueId of plan.issueIds) {
        await collectTicket(deps, issueId, patterns);
      }
      const finishedAt = deps.clock.now();
      await deps.cursors.save({
        projectId: job.projectId,
        objectType: job.objectType,
        lastIssueId: plan.lastIssueId,
        lastRunAt: finishedAt,
      });
      return {
        projectId: job.projectId,
        objectType: job.objectType,
        issueIds: plan.issueIds,
        lastIssueId: plan.lastIssueId,
        startedAt,
        finishedAt,
        complete: plan.complete,
      };
    },
  };
}