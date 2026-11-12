/**
 * The facts of one project, loaded once per nightly pass — SPEC §17, §19.
 *
 * Every list is bounded (SPEC §18: "aucune liste sans limite"): the nightly
 * pass reads at most `NIGHTLY_LIST_LIMIT` rows per table, oldest first, and
 * the next run resumes where the cache is still stale (DP-18).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { Involvement, IssueClass, Outcome, ReviewFact } from '../types.js';

/** Bound of each per-project list the nightly pass reads (SPEC §19). */
export const NIGHTLY_LIST_LIMIT = 1000;

/** The joined per-ticket facts of one project, keyed by issue id. */
export interface ProjectFacts {
  readonly involvements: Map<string, Involvement>;
  readonly classes: Map<string, IssueClass>;
  readonly outcomes: Map<string, Outcome>;
  readonly reviews: Map<string, ReviewFact[]>;
}

function groupedReviews(reviews: readonly ReviewFact[]): Map<string, ReviewFact[]> {
  const map = new Map<string, ReviewFact[]>();
  for (const review of reviews) {
    const list = map.get(review.issueId);
    if (list === undefined) map.set(review.issueId, [review]);
    else list.push(review);
  }
  return map;
}

/** Loads the bounded facts of one project through the injected stores. */
export async function loadProjectFacts(deps: Deps, projectId: string): Promise<ProjectFacts> {
  const [involvements, classes, outcomes, reviews] = await Promise.all([
    deps.stores.involvement.listByProject(projectId, NIGHTLY_LIST_LIMIT),
    deps.stores.issueClass.listByProject(projectId, NIGHTLY_LIST_LIMIT),
    deps.stores.outcome.listByProject(projectId, NIGHTLY_LIST_LIMIT),
    deps.stores.reviewFact.listByProject(projectId, NIGHTLY_LIST_LIMIT),
  ]);
  return {
    involvements: new Map(involvements.map((item) => [item.issueId, item])),
    classes: new Map(classes.map((item) => [item.issueId, item])),
    outcomes: new Map(outcomes.map((item) => [item.issueId, item])),
    reviews: groupedReviews(reviews),
  };
}
