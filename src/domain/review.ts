/**
 * Review load (SPEC §6 "Relecture", SPEC §19 "Nombre d'allers-retours";
 * DP-05, DP-17).
 *
 * The graph only gives the *current* opinion of each reviewer, never the number
 * of round trips: the load is an approximation built from comments and commits
 * added after the pull request was opened (SPEC §6, SPEC §19).
 */
import type { ReviewFact } from '../types.js';
import type { GraphPullRequest, GraphReviewer } from '../types-graph.js';

/** The reviewers whose current opinion asks for changes (SPEC §6). */
export function changesRequested(reviewers: readonly GraphReviewer[]): number {
  return reviewers.filter(reviewer => reviewer.verdict === 'changes-requested').length;
}

/**
 * Distinct reviewers: the account id is used only to count them, never
 * displayed (SPEC §7 rule 8, DP-17).
 */
function distinctReviewers(reviewers: readonly GraphReviewer[]): number {
  const ids = new Set(
    reviewers.map(reviewer => reviewer.accountId).filter(accountId => accountId !== ''),
  );
  return ids.size > 0 ? ids.size : reviewers.length;
}

/** The review fact kept of one pull request (SPEC §6, SPEC §18 `review_fact`). */
export function reviewFact(issueId: string, pr: GraphPullRequest): ReviewFact {
  return {
    issueId,
    prRef: pr.ref,
    reviewerCount: distinctReviewers(pr.reviewers),
    changesRequested: changesRequested(pr.reviewers),
    commentCount: pr.commentCount,
    commitsAfterOpen: pr.commitsAfterOpen,
    openedAt: pr.openedAt,
    mergedAt: pr.mergedAt,
  };
}

/** The mean of the review load of several pull requests; 0 when there is none. */
function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}

/**
 * The review load of a set of pull requests: the mean of
 * `reviewerCount + changesRequested + commentCount` (contract L2, SPEC §6).
 *
 * It is displayed next to the rate and never used alone to conclude (SPEC §7).
 */
export function reviewLoad(facts: readonly ReviewFact[]): number {
  return mean(
    facts.map(fact => fact.reviewerCount + fact.changesRequested + fact.commentCount),
  );
}

/**
 * The documented composite index of the review effort (DP-05): comments,
 * commits added after the pull request was opened, and the reviewers asking for
 * changes. It approximates the round trips the graph does not expose; it is
 * never presented as a count of round trips (SPEC §6, SPEC §19).
 */
export function reviewEffort(fact: ReviewFact): number {
  return fact.changesRequested + fact.commentCount + fact.commitsAfterOpen;
}

/** The mean effort index of several pull requests; 0 when there is none. */
export function reviewEffortLoad(facts: readonly ReviewFact[]): number {
  return mean(facts.map(fact => reviewEffort(fact)));
}

/**
 * True when the review effort is clearly heavier than the threshold: the
 * threshold is configurable, and the comparison is explicit (SPEC §8
 * "relecture renforcée", DP-05).
 */
export function isMuchHeavier(effort: number, threshold: number): boolean {
  return effort >= threshold;
}