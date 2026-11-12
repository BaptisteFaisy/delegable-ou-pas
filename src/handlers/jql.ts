/**
 * The JQL function `delegable()` — SPEC §16.4, §19; DP-11, DP-15, DP-24.
 *
 * `issue in delegable()` returns the tickets whose cached recommendation is
 * "hand it to an agent": the function reads the nightly cache, never
 * recomputes (SPEC §20), and the list is bounded (SPEC §18). No person
 * identifier enters or leaves: the payload's project key is the only context
 * used (recipe 12).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import { getDeps } from '../deps.js';
import { asRecord, PROJECT_LIST_LIMIT } from '../actions/common.js';

/** Bound of the returned list (SPEC §18: no list without a limit). */
export const JQL_LIMIT = 1000;

/** The project the query runs in; the first known project when unspecified. */
async function projectIdOf(deps: Deps, payload: unknown): Promise<string> {
  const record = asRecord(payload);
  const projectKey = typeof record.projectKey === 'string' ? record.projectKey : '';
  const projects = await deps.settings.list(PROJECT_LIST_LIMIT);
  if (projectKey !== '') {
    const match = projects.find((settings) => settings.projectKey === projectKey);
    if (match !== undefined) return match.projectId;
  }
  return projects[0]?.projectId ?? '';
}

/** The bounded issue ids recommended for delegation (SPEC §16.4). */
export async function runJqlDelegable(deps: Deps, payload: unknown): Promise<{ issueIds: string[] }> {
  const projectId = await projectIdOf(deps, payload);
  if (projectId === '') return { issueIds: [] };
  const cards = await deps.stores.recommendation.listByProject(projectId, 'delegate', JQL_LIMIT);
  return { issueIds: cards.map((card) => card.issueId) };
}

/** The manifest entry `handlers/jql.jqlDelegable` (docs/CONTRACTS.md §6). */
export async function jqlDelegable(payload: unknown): Promise<unknown> {
  return runJqlDelegable(await getDeps(), payload);
}
