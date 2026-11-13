/**
 * SPEC §6, §17 · DP-20 — the pull requests of the demo dataset.
 *
 * The graph gives the *current* opinion of each reviewer, never the number of
 * round trips: the review load is approximated by the comments and the commits
 * added after the pull request was opened (SPEC §6 "Relecture", SPEC §19).
 * No reviewer is named: only a count (SPEC §18, DP-17).
 */
import type { ReviewFact } from '../types.js';
import type { Seed } from './issues.js';
import { addHours, contentHash } from './project.js';

/** A stable pull request reference. */
export function prRefOf(seed: Seed): string {
  return `pr-${seed.key.toLowerCase()}-${contentHash(seed.key).slice(-6)}`;
}

/** True when a ticket carries a pull request: two commits or more (SPEC §6). */
export function hasPullRequest(seed: Seed): boolean {
  return seed.commits >= 2;
}

/** The reviewers of one pull request: two on a heavy review, one or two else. */
function reviewersOf(seed: Seed): number {
  return seed.heavyReview ? 2 : 1 + (seed.position % 2);
}

/** The changes requested on one pull request (SPEC §6 "Relecture"). */
function changesRequestedOf(seed: Seed): number {
  if (seed.heavyReview) return 1 + (seed.position % 2);
  return seed.position % 3 === 0 ? 1 : 0;
}

/** The comments of one pull request: the load the team really carries. */
function commentsOf(seed: Seed): number {
  return seed.heavyReview ? 3 + (seed.position % 4) : seed.position % 5;
}

/**
 * The review fact of one ticket (SPEC §18 table `review_fact`).
 *
 * `mergedAt` stays empty while the pull request is open: an open ticket has no
 * merged pull request (SPEC §6).
 */
export function reviewFactOf(seed: Seed): ReviewFact | null {
  if (!hasPullRequest(seed)) return null;
  return {
    issueId: seed.id,
    prRef: prRefOf(seed),
    reviewerCount: reviewersOf(seed),
    changesRequested: changesRequestedOf(seed),
    commentCount: commentsOf(seed),
    commitsAfterOpen: Math.max(0, seed.commits - 1),
    openedAt: addHours(seed.createdAt, 12),
    mergedAt: seed.closedAt,
  };
}

/** Every review fact of the demo dataset. */
export function sampleReviewFacts(seeds: readonly Seed[]): readonly ReviewFact[] {
  return seeds.flatMap((seed) => {
    const fact = reviewFactOf(seed);
    return fact === null ? [] : [fact];
  });
}

/** The review load of one arm: comments plus changes requested (SPEC §6). */
export function reviewLoadOf(facts: readonly ReviewFact[]): number {
  return facts.reduce((total, fact) => total + fact.commentCount + fact.changesRequested, 0);
}
