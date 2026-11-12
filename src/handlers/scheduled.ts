/**
 * The scheduled trigger — SPEC §17 "Statistiques", §19 (900 s max); DP-18,
 * DP-21, DP-22.
 *
 * Every night: the results that matured, the cohorts, the calibration and the
 * recommendation cards are recomputed and the caches updated (`computedAt` —
 * the screens show the age of the cache). The pass is sliced per project and
 * bounded inside each project (DP-18): a run that reaches its budget stops,
 * and the next run resumes where the caches are still stale.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { ProjectSettings } from '../types-advice.js';
import { PROJECT_LIST_LIMIT } from '../actions/common.js';
import { loadProjectFacts } from './project-facts.js';
import { recomputeCalibration, recomputeCohorts, recomputeRecommendations, staleMatured } from './recompute.js';

/** The wall budget of one run, under the 900 s platform limit (SPEC §19). */
export const NIGHTLY_BUDGET_MS = 800_000;

/** What one project's pass did, for the log and the tests. */
export interface ProjectReport {
  readonly projectId: string;
  readonly cohortRows: number;
  readonly calibrationRows: number;
  readonly cards: number;
}

/** What one nightly run did, project by project. */
export interface NightlyReport {
  readonly projects: number;
  readonly reports: readonly ProjectReport[];
  /** True when the budget ran out before the last project (DP-18). */
  readonly stoppedEarly: boolean;
}

/** Recomputes every cache of one project (SPEC §17). */
export async function recomputeProject(deps: Deps, settings: ProjectSettings): Promise<ProjectReport> {
  const facts = await loadProjectFacts(deps, settings.projectId);
  const now = deps.clock.now();
  const stale = await staleMatured(deps, facts, now);
  const cohortRows = await recomputeCohorts(deps, settings, facts);
  const calibrationRows = await recomputeCalibration(deps, settings, facts);
  const cards = await recomputeRecommendations(deps, settings, stale, facts);
  return { projectId: settings.projectId, cohortRows, calibrationRows, cards };
}

/** The manifest entry `handlers/scheduled.onScheduled` (docs/CONTRACTS.md §6). */
export async function onScheduled(deps: Deps): Promise<NightlyReport> {
  const startedAt = Date.parse(deps.clock.now());
  const projects = await deps.settings.list(PROJECT_LIST_LIMIT);
  const reports: ProjectReport[] = [];
  let stoppedEarly = false;
  for (const settings of projects) {
    if (Date.parse(deps.clock.now()) - startedAt > NIGHTLY_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    try {
      reports.push(await recomputeProject(deps, settings));
    } catch (error: unknown) {
      // One broken project never stops the night of the others (SPEC §20).
      deps.logger.log('error', `nightly pass failed on ${settings.projectId}`, error instanceof Error ? error.message : String(error));
    }
  }
  deps.logger.log('info', `nightly pass done: ${reports.length}/${projects.length} projects`);
  return { projects: projects.length, reports, stoppedEarly };
}
