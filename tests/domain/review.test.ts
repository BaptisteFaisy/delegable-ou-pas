/**
 * Tests of the review load (SPEC §6 "Relecture", SPEC §19; DP-05, DP-17).
 */
import { describe, expect, it } from 'vitest';
import type { GraphPullRequest, GraphReviewer } from '../../src/types-graph.js';
import type { ReviewFact } from '../../src/types.js';
import {
  changesRequested,
  isMuchHeavier,
  reviewEffort,
  reviewEffortLoad,
  reviewFact,
  reviewLoad,
} from '../../src/domain/review.js';

/** One reviewer of the graph, with its current opinion only (SPEC §19). */
function reviewer(accountId: string, verdict: GraphReviewer['verdict']): GraphReviewer {
  return { accountId, verdict };
}

/** One pull request reached through a commit (SPEC §19). */
function pullRequest(overrides: Partial<GraphPullRequest> = {}): GraphPullRequest {
  return {
    ref: 'pr-1',
    state: 'merged',
    reviewers: [],
    commentCount: 0,
    commitsAfterOpen: 0,
    openedAt: '2026-03-02T09:00:00Z',
    mergedAt: '2026-03-03T09:00:00Z',
    authorAccountId: 'account-1',
    ...overrides,
  };
}

/** One review fact built by hand. */
function fact(overrides: Partial<ReviewFact> = {}): ReviewFact {
  return {
    issueId: 'PROJ-1',
    prRef: 'pr-1',
    reviewerCount: 0,
    changesRequested: 0,
    commentCount: 0,
    commitsAfterOpen: 0,
    openedAt: '2026-03-02T09:00:00Z',
    mergedAt: '2026-03-03T09:00:00Z',
    ...overrides,
  };
}

describe('charge de relecture', () => {
  it('compte les relecteurs distincts sans rendre d’identité', () => {
    const built = reviewFact(
      'PROJ-1',
      pullRequest({
        reviewers: [
          reviewer('account-2', 'approved'),
          reviewer('account-2', 'changes-requested'),
          reviewer('account-3', 'none'),
        ],
      }),
    );
    expect(built.reviewerCount).toBe(2);
    expect(built.changesRequested).toBe(1);
    expect(JSON.stringify(built)).not.toContain('account-2');
  });

  it('suit l’avis actuel des relecteurs, pas un compte d’allers-retours', () => {
    expect(changesRequested([reviewer('a', 'approved'), reviewer('b', 'changes-requested')])).toBe(1);
    expect(changesRequested([])).toBe(0);
  });

  it('moyenne la charge de relecture sur plusieurs pull requests', () => {
    const load = reviewLoad([
      fact({ reviewerCount: 2, changesRequested: 1, commentCount: 3 }),
      fact({ prRef: 'pr-2', reviewerCount: 1, changesRequested: 0, commentCount: 1 }),
    ]);
    expect(load).toBe(4);
    expect(reviewLoad([])).toBe(0);
  });

  it('approche les allers-retours par les commentaires et les commits ajoutés', () => {
    const effort = reviewEffort(fact({ changesRequested: 2, commentCount: 5, commitsAfterOpen: 3 }));
    expect(effort).toBe(10);
    expect(reviewEffortLoad([fact({ changesRequested: 1, commentCount: 1, commitsAfterOpen: 2 })])).toBe(
      4,
    );
  });

  it('dit « nettement plus lourde » au-dessus d’un seuil réglable', () => {
    expect(isMuchHeavier(12, 10)).toBe(true);
    expect(isMuchHeavier(10, 10)).toBe(true);
    expect(isMuchHeavier(9, 10)).toBe(false);
  });

  it('rend une pull request encore ouverte sans date de fusion', () => {
    const built = reviewFact('PROJ-1', pullRequest({ state: 'open', mergedAt: '' }));
    expect(built.mergedAt).toBe('');
  });
});