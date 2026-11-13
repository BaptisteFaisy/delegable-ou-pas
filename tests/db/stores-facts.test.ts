/**
 * Commit and review fact stores (SPEC §6, SPEC §17, SPEC §18, DP-05).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createCommitFactStore } from '../../src/db/commit-facts.js';
import { createReviewFactStore } from '../../src/db/review-facts.js';
import type { CommitFactStore, ReviewFactStore } from '../../src/ports.js';
import { ISSUE, PROJECT, sampleCommitFact, sampleReviewFact } from './fixtures.js';
import { allSelectsBounded, createFakeSql, nothingDeleted, type FakeSql } from './sql-fake.js';

let fake: FakeSql;
let commits: CommitFactStore;
let reviews: ReviewFactStore;

beforeEach(async () => {
  fake = await createFakeSql();
  commits = createCommitFactStore(fake);
  reviews = createReviewFactStore(fake);
});

describe('CommitFactStore', () => {
  it('answers an empty list for a ticket with no commit', async () => {
    await expect(commits.listByIssue('PROJ-404')).resolves.toEqual([]);
    await expect(commits.countByIssue('PROJ-404')).resolves.toEqual({ total: 0, signed: 0 });
  });

  it('reads back the facts of a ticket, oldest first', async () => {
    const facts = [
      { ...sampleCommitFact(ISSUE, 'sha-2'), committedAt: '2026-11-02T09:00:00.000Z' },
      { ...sampleCommitFact(ISSUE, 'sha-1'), committedAt: '2026-11-01T09:00:00.000Z' },
    ];
    await commits.saveMany(facts);
    const back = await commits.listByIssue(ISSUE);
    expect(back.map((fact) => fact.commitRef)).toEqual(['sha-1', 'sha-2']);
    expect(back).toEqual([...facts].reverse());
  });

  it('leaves one row per commit when the same batch is replayed', async () => {
    const facts = [sampleCommitFact(ISSUE, 'sha-1'), sampleCommitFact(ISSUE, 'sha-2')];
    await commits.saveMany(facts);
    await commits.saveMany(facts);
    expect(fake.rowCount('commit_fact')).toBe(2);
  });

  it('stores the fact and nothing else: no message, ever', async () => {
    await commits.saveMany([sampleCommitFact()]);
    const [row] = fake.rowsOf('commit_fact');
    expect(Object.keys(row).sort()).toEqual([
      'agent_name',
      'author_is_bot',
      'commit_ref',
      'committed_at',
      'has_signature',
      'issue_id',
    ]);
  });

  it('counts the signed commits of a ticket', async () => {
    await commits.saveMany([
      sampleCommitFact(ISSUE, 'sha-1'),
      { ...sampleCommitFact(ISSUE, 'sha-2'), hasSignature: false, agentName: '' },
      sampleCommitFact('OTHER-1', 'sha-3'),
    ]);
    await expect(commits.countByIssue(ISSUE)).resolves.toEqual({ total: 2, signed: 1 });
  });

  it('lists one project only and stops at the bound', async () => {
    await commits.saveMany([
      { ...sampleCommitFact('PROJ-1', 'sha-1'), committedAt: '2026-11-01T09:00:00.000Z' },
      { ...sampleCommitFact('PROJ-2', 'sha-2'), committedAt: '2026-11-02T09:00:00.000Z' },
      { ...sampleCommitFact('PROJ-3', 'sha-3'), committedAt: '2026-11-03T09:00:00.000Z' },
      sampleCommitFact('OTHER-1', 'sha-9'),
    ]);
    const page = await commits.listByProject(PROJECT, 2);
    expect(page.map((fact) => fact.commitRef)).toEqual(['sha-3', 'sha-2']);
    await expect(commits.listByProject('ABSENT', 10)).resolves.toEqual([]);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await commits.saveMany([sampleCommitFact()]);
    await commits.listByIssue(ISSUE);
    await commits.listByProject(PROJECT, 10);
    await commits.countByIssue(ISSUE);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});

describe('ReviewFactStore', () => {
  it('answers an empty list for a ticket with no pull request', async () => {
    await expect(reviews.listByIssue('PROJ-404')).resolves.toEqual([]);
  });

  it('reads back the facts of a ticket without loss', async () => {
    const facts = [sampleReviewFact(ISSUE, 'pr-1'), sampleReviewFact(ISSUE, 'pr-2')];
    await reviews.saveMany(facts);
    await expect(reviews.listByIssue(ISSUE)).resolves.toEqual(facts);
  });

  it('leaves one row per pull request when the same batch is replayed', async () => {
    const facts = [sampleReviewFact(ISSUE, 'pr-1')];
    await reviews.saveMany(facts);
    await reviews.saveMany(facts);
    expect(fake.rowCount('review_fact')).toBe(1);
  });

  it('keeps an open pull request with an empty merge date', async () => {
    await reviews.saveMany([{ ...sampleReviewFact(ISSUE, 'pr-1'), mergedAt: '' }]);
    const [fact] = await reviews.listByIssue(ISSUE);
    expect(fact.mergedAt).toBe('');
  });

  it('lists one project only and stops at the bound', async () => {
    await reviews.saveMany([
      { ...sampleReviewFact('PROJ-1', 'pr-1'), openedAt: '2026-11-01T09:00:00.000Z' },
      { ...sampleReviewFact('PROJ-2', 'pr-2'), openedAt: '2026-11-02T09:00:00.000Z' },
      sampleReviewFact('OTHER-1', 'pr-9'),
    ]);
    const page = await reviews.listByProject(PROJECT, 1);
    expect(page.map((fact) => fact.prRef)).toEqual(['pr-2']);
    await expect(reviews.listByProject('ABSENT', 10)).resolves.toEqual([]);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await reviews.saveMany([sampleReviewFact()]);
    await reviews.listByIssue(ISSUE);
    await reviews.listByProject(PROJECT, 10);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});
