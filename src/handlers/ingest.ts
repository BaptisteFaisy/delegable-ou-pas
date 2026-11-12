/**
 * The session ingest — SPEC §17 "Graphe : la session d'un utilisateur", §19;
 * DP-18, DP-19.
 *
 * The Teamwork Graph only reads on behalf of a signed-in user, so the
 * collection runs in slices DURING a user session and resumes where it
 * stopped: this module plans the slice with the frozen L6 prioritisation
 * (the tickets that bring the most information first) and hands the job to
 * the consumer (`consumer.ts`). The queue is inline — a Forge session has no
 * background worker, and a missing right empties a slice instead of raising
 * (recipe 15).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { Queue } from '../ports.js';
import type { CollectionJob } from '../ports.js';
import type { CollectionSlice } from '../types-graph.js';
import type { ProjectSettings } from '../types-advice.js';
import type { CollectionCandidate, PrioritisedSlice } from '../collect/priority.js';
import { DEFAULT_BUDGET_MINUTES, prioritise } from '../collect/priority.js';
import { armOf, cohortKeyOf, cohortKeyString } from '../domain/cohort.js';
import { CACHE_LIST_LIMIT } from '../actions/common.js';
import { loadProjectFacts } from './project-facts.js';
import { createGraphConsumer } from './consumer.js';

/** The default size of one collection slice, in tickets (DP-18). */
export const DEFAULT_SLICE_SIZE = 25;

/** The candidates of one project: what the coverage map does not know yet. */
export async function sessionCandidates(deps: Deps, projectId: string): Promise<CollectionCandidate[]> {
  const facts = await loadProjectFacts(deps, projectId);
  const commits = await deps.stores.commitFact.listByProject(projectId, CACHE_LIST_LIMIT);
  const signed = new Set(commits.filter((fact) => fact.hasSignature).map((fact) => fact.issueId));
  const collected = new Set(commits.map((fact) => fact.issueId));
  const candidates: CollectionCandidate[] = [];
  for (const [issueId, issueClass] of facts.classes) {
    const level = facts.involvements.get(issueId)?.level ?? 'unknown';
    candidates.push({
      issueId,
      cohortKey: cohortKeyString(cohortKeyOf(issueClass, 'nature-zone-size')),
      arm: armOf(level) ?? 'unknown',
      closedAt: facts.outcomes.get(issueId)?.closedAt ?? null,
      alreadyCollected: collected.has(issueId),
      commitsSigned: signed.has(issueId),
    });
  }
  return candidates;
}

/** Plans one session slice: the most informative tickets, explained (SPEC §17). */
export async function planSessionSlice(
  deps: Deps,
  settings: ProjectSettings,
  budgetMinutes: number = DEFAULT_BUDGET_MINUTES,
): Promise<PrioritisedSlice> {
  const candidates = await sessionCandidates(deps, settings.projectId);
  return prioritise(candidates, { threshold: settings.minArmSize, budgetMinutes });
}

/** Works one collection slice, cursor included (DP-18). */
export async function runIngestSlice(deps: Deps, job: CollectionJob): Promise<CollectionSlice> {
  return createGraphConsumer(deps).handle(job);
}

/**
 * The producer side of the queue: a job published during a session is worked
 * inline, one slice at a time (SPEC §17 — the graph reads only inside an open
 * user session, never in the background).
 */
export function createIngestQueue(deps: Deps): Queue {
  return {
    publish: async (job: CollectionJob) => {
      await runIngestSlice(deps, job);
    },
  };
}
