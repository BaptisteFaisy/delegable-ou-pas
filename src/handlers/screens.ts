/**
 * The screen routes behind the unique resolver — SPEC §16, §20; DP-11, DP-24.
 *
 * The screens (lot L8) call the resolver by method name (`src/ui/components/
 * data.tsx`): each route answers with DOMAIN data — the screens project it
 * themselves through the viewmodels, so no view logic lives here (zero
 * duplication). Absent data is normal: a route answers `null` fields, never
 * an exception, and a screen without figures renders its explicit empty state
 * (SPEC §20).
 *
 * The contract signatures of docs/CONTRACTS.md §L7 take `(deps, payload)`; the
 * Forge `context` rides along as an optional third argument (it carries the
 * issue, the project or the sprint the screen was opened on).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { Calibration, Coverage, DelegationMap, ProjectSettings } from '../types-advice.js';
import type { Epoch, Involvement, SignaturePattern } from '../types.js';
import type { Decision } from '../types-advice.js';
import type { JiraTicketSummary } from '../types-graph.js';
import type { RecommendationCard } from '../types-advice.js';
import type { DelegableWorkItem } from '../types-mcp.js';
import { adviceAddsNothing } from '../domain/calibration.js';
import { currentEpoch } from '../domain/epochs.js';
import { share } from '../domain/stats.js';
import { buildCohortOutput } from '../actions/get-cohort.js';
import { delegableItems } from '../actions/list-delegable-work.js';
import { recordDecision } from '../actions/record-decision.js';
import { reportTakeover } from '../actions/report-takeover.js';
import { asRecord, CACHE_LIST_LIMIT, MAX_LIMIT } from '../actions/common.js';

/** Bounded read of one sprint (SPEC §19: no list without a limit). */
export const SPRINT_ISSUES_LIMIT = 200;

/* --------------------------------------------------------- context reads */

function dig(value: unknown, ...path: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return current;
}

function textOr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The issue the panel was opened on: id first, key as a fallback. */
export function issueOf(payload: unknown, context: unknown): { id: string; key: string } {
  const fromContext = dig(context, 'extension', 'issue');
  const fromPayload = asRecord(payload).issue ?? asRecord(payload);
  const id = textOr(dig(fromContext, 'id')) || textOr(asRecord(fromPayload).issueId);
  const key = textOr(dig(fromContext, 'key')) || textOr(asRecord(fromPayload).issueKey);
  return { id: id || key, key: key || id };
}

/** The project the screen was opened on; the first known project otherwise. */
export async function projectIdOf(deps: Deps, payload: unknown, context: unknown): Promise<string> {
  const direct =
    textOr(dig(context, 'extension', 'project', 'id')) ||
    textOr(dig(context, 'project', 'id')) ||
    textOr(asRecord(payload).projectId);
  if (direct !== '') return direct;
  const projects = await deps.settings.list(1);
  return projects[0]?.projectId ?? '';
}

/**
 * The method names the screens call. They mirror `RESOLVER_METHOD` of
 * `src/ui/components/data.tsx` (lot L8) — duplicated on purpose: L7 must not
 * import the UI layer, and the names are the announced interface between the
 * two lots (declared in the pull request body).
 */
export const RESOLVER_METHODS = {
  issuePanel: 'issue-panel',
  projectPage: 'project-page',
  cohort: 'cohort',
  sprintSplit: 'sprint-split',
  settings: 'settings',
  gadget: 'gadget',
  recordDecision: 'record-decision',
  reportTakeover: 'report-takeover',
} as const;

/* ------------------------------------------------------------ the routes */

/** The ticket panel: the cached card, the decision, the involvement (SPEC §16.1). */
export async function resolveIssuePanel(deps: Deps, payload: unknown, context?: unknown): Promise<unknown> {
  const issue = issueOf(payload, context);
  if (issue.id === '') return { card: null, decision: null, involvement: null };
  const [card, decision, involvement] = await Promise.all([
    deps.engine.read(issue.id),
    deps.stores.decision.get(issue.id),
    deps.stores.involvement.get(issue.id),
  ]);
  const panel: { card: RecommendationCard | null; decision: Decision | null; involvement: Involvement | null } = {
    card,
    decision,
    involvement,
  };
  return panel;
}

/** The calibration rows of the current epoch, with the honest warning (SPEC §10). */
async function calibrationOf(deps: Deps, projectId: string): Promise<{ rows: Calibration[]; adds: boolean }> {
  const epochs = await deps.stores.epoch.listByProject(projectId);
  const current = currentEpoch(epochs);
  const rows = current === null ? [] : await deps.stores.calibration.listByProject(projectId, current.id);
  return { rows, adds: adviceAddsNothing(rows) };
}

/** The project page: map, coverage, calibration (SPEC §16.2, §16.6, §16.7). */
export async function resolveProjectPage(deps: Deps, payload: unknown, context?: unknown): Promise<unknown> {
  const projectId = await projectIdOf(deps, payload, context);
  if (projectId === '') return { map: null, coverage: null, calibrationRows: [], adviceAddsNothing: true };
  const [map, coverage, calibration] = await Promise.all([
    deps.engine.map(projectId, ''),
    deps.stores.coverage.get(projectId),
    calibrationOf(deps, projectId),
  ]);
  const page: {
    map: DelegationMap | null;
    coverage: Coverage | null;
    calibrationRows: Calibration[];
    adviceAddsNothing: boolean;
  } = { map, coverage, calibrationRows: calibration.rows, adviceAddsNothing: calibration.adds };
  return page;
}

/** The settings page: settings, signature catalogue, epochs (SPEC §16.5). */
export async function resolveSettingsPage(deps: Deps, payload: unknown, context?: unknown): Promise<unknown> {
  const projectId = await projectIdOf(deps, payload, context);
  const settings: ProjectSettings | null = projectId === '' ? null : await deps.settings.get(projectId);
  const patterns: SignaturePattern[] = settings === null ? [] : await deps.stores.signature.list();
  const epochs: Epoch[] = settings === null ? [] : await deps.stores.epoch.listByProject(projectId);
  return { settings, patterns, epochs };
}

/** The cohort screen: the cached epochs of one cell (SPEC §16.3, recipe 14). */
export async function resolveCohort(deps: Deps, payload: unknown, context?: unknown): Promise<unknown> {
  const projectId = await projectIdOf(deps, payload, context);
  const settings = projectId === '' ? null : await deps.settings.get(projectId);
  if (settings === null) return { cohort: null };
  const record = asRecord(payload);
  const nature = textOr(record.nature);
  const zone = textOr(record.zone);
  const size = textOr(record.size);
  if (nature === '' || zone === '' || size === '') return { cohort: null };
  const cohort = await buildCohortOutput(deps, settings, { projectKey: settings.projectKey, nature, zone, size });
  return { cohort };
}

/** The delegable share of one sprint: points when there are, counts otherwise (DP-24). */
export function sprintShare(cards: readonly RecommendationCard[], summaries: readonly JiraTicketSummary[]): number {
  const delegated = new Set(cards.map((card) => card.issueId));
  const points = summaries.reduce((total, item) => total + (item.storyPoints ?? 0), 0);
  if (points > 0) {
    const delegable = summaries
      .filter((item) => delegated.has(item.id))
      .reduce((total, item) => total + (item.storyPoints ?? 0), 0);
    return share(delegable, points);
  }
  return share(delegated.size, summaries.length);
}

/** The sprint action: the split of the sprint, safest first (SPEC §16.4, DP-24). */
export async function onSprintAction(deps: Deps, payload: unknown, context?: unknown): Promise<unknown> {
  const sprintId = textOr(dig(context, 'extension', 'sprint', 'id')) || textOr(asRecord(payload).sprintId);
  const summaries = await deps.jira.sprintIssues(sprintId, SPRINT_ISSUES_LIMIT);
  const cards: RecommendationCard[] = [];
  for (const summary of summaries) {
    const card = await deps.engine.read(summary.id);
    if (card !== null && card.value === 'delegate') cards.push({ ...card, issueKey: summary.key });
  }
  const items: DelegableWorkItem[] = delegableItems(cards);
  return { items, delegableShare: sprintShare(cards, summaries), sprintId };
}

/** The dashboard gadget: the reduced map (SPEC §16.8). */
export async function resolveGadget(deps: Deps, payload: unknown, context?: unknown): Promise<unknown> {
  const projectId = await projectIdOf(deps, payload, context);
  const map = projectId === '' ? null : await deps.engine.map(projectId, '');
  return { map };
}

/** The panel button: records the decision on the opened ticket (SPEC §8). */
async function screenRecordDecision(deps: Deps, payload: unknown, context?: unknown): Promise<unknown> {
  const issue = issueOf(payload, context);
  const record = asRecord(payload);
  const decision = record.decision === 'keep-human' ? 'keep-human' : 'delegate';
  if (issue.key === '') return null;
  const result = await recordDecision(deps, { issueKey: issue.key, decision, reason: textOr(record.reason) });
  return result.data;
}

/** The panel button: reports a human takeover on the opened ticket (SPEC §9). */
async function screenReportTakeover(deps: Deps, payload: unknown, context?: unknown): Promise<unknown> {
  const issue = issueOf(payload, context);
  if (issue.key === '') return null;
  const result = await reportTakeover(deps, { issueKey: issue.key, reason: textOr(asRecord(payload).reason) });
  return result.data;
}

/* ------------------------------------------------------------- the table */

/** One screen route: frozen `(deps, payload)` plus the optional Forge context. */
export type ScreenRoute = (deps: Deps, payload: unknown, context?: unknown) => Promise<unknown>;

/** The methods the screens call, mapped to their route (interface with L8). */
export const SCREEN_ROUTES: Readonly<Record<string, ScreenRoute>> = {
  [RESOLVER_METHODS.issuePanel]: resolveIssuePanel,
  [RESOLVER_METHODS.projectPage]: resolveProjectPage,
  [RESOLVER_METHODS.cohort]: resolveCohort,
  [RESOLVER_METHODS.sprintSplit]: onSprintAction,
  [RESOLVER_METHODS.settings]: resolveSettingsPage,
  [RESOLVER_METHODS.gadget]: resolveGadget,
  [RESOLVER_METHODS.recordDecision]: screenRecordDecision,
  [RESOLVER_METHODS.reportTakeover]: screenReportTakeover,
};

/** The method names the resolver defines (kept in sync with L8 by import). */
export const SCREEN_METHODS: readonly string[] = Object.keys(SCREEN_ROUTES);

/** Routes one resolver call; an unknown method answers `null`, never throws. */
export async function routeScreen(
  deps: Deps,
  method: string,
  payload: unknown,
  context: unknown,
): Promise<unknown> {
  const route = SCREEN_ROUTES[method];
  if (route === undefined) return null;
  try {
    return await route(deps, payload, context);
  } catch (error: unknown) {
    deps.logger.log('error', `resolver method failed: ${method}`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Re-exported cap so the sprint route and the tests share one bound. */
export { MAX_LIMIT, CACHE_LIST_LIMIT };
