/**
 * Recommendation, decision and trial stores (SPEC §8, SPEC §11, SPEC §18,
 * DP-11, DP-13, DP-27, recipe 16).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createDecisionStore } from '../../src/db/decisions.js';
import { createRecommendationStore } from '../../src/db/recommendations.js';
import { createTrialStore } from '../../src/db/trials.js';
import type { DecisionStore, RecommendationStore, TrialStore } from '../../src/ports.js';
import { AT, ISSUE, PROJECT, sampleAssignment, sampleCard, sampleDecision, sampleTrial } from './fixtures.js';
import { allSelectsBounded, createFakeSql, nothingDeleted, type FakeSql } from './sql-fake.js';

let fake: FakeSql;
let cards: RecommendationStore;
let decisions: DecisionStore;
let trials: TrialStore;

beforeEach(async () => {
  fake = await createFakeSql();
  cards = createRecommendationStore(fake);
  decisions = createDecisionStore(fake);
  trials = createTrialStore(fake);
});

describe('RecommendationStore', () => {
  it('answers null for a ticket with no cached card', async () => {
    await expect(cards.get('PROJ-404')).resolves.toBeNull();
  });

  it('reads back the verdict it cached', async () => {
    const card = sampleCard();
    await cards.save(card);
    const back = await cards.get(ISSUE);
    expect(back).not.toBeNull();
    expect(back?.value).toBe(card.value);
    expect(back?.cohort).toEqual(card.cohort);
    expect(back?.confidence).toBe(card.confidence);
    expect(back?.reasons).toEqual(card.reasons);
    expect(back?.referenceIssueKeys).toEqual(card.referenceIssueKeys);
    expect(back?.computedAt).toBe(card.computedAt);
  });

  it('leaves one row when the same card is cached twice', async () => {
    await cards.save(sampleCard());
    await cards.save(sampleCard());
    expect(fake.rowCount('recommendation')).toBe(1);
  });

  it('replaces the cached card when the advice changes', async () => {
    await cards.save(sampleCard());
    await cards.save({ ...sampleCard(), value: 'keep-human' });
    expect(fake.rowCount('recommendation')).toBe(1);
    await expect(cards.get(ISSUE)).resolves.toMatchObject({ value: 'keep-human' });
  });

  it('lists the tickets carrying one advice, most confident first, bounded', async () => {
    await cards.save({ ...sampleCard('PROJ-1'), computedAt: '2026-11-01T00:00:00.000Z' });
    await cards.save({ ...sampleCard('PROJ-2'), computedAt: '2026-11-03T00:00:00.000Z' });
    await cards.save({ ...sampleCard('PROJ-3'), computedAt: '2026-11-02T00:00:00.000Z' });
    await cards.save({ ...sampleCard('PROJ-4'), value: 'keep-human' });
    await cards.save({ ...sampleCard('OTHER-1') });

    const page = await cards.listByProject(PROJECT, 'delegate-with-review', 2);
    expect(page.map((card) => card.issueId)).toEqual(['PROJ-2', 'PROJ-3']);
    await expect(cards.listByProject(PROJECT, 'delegate', 10)).resolves.toEqual([]);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await cards.save(sampleCard());
    await cards.get(ISSUE);
    await cards.listByProject(PROJECT, 'delegate-with-review', 10);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});

describe('DecisionStore', () => {
  it('answers null for a ticket with no decision', async () => {
    await expect(decisions.get('PROJ-404')).resolves.toBeNull();
    await expect(decisions.listByProject(PROJECT, 10)).resolves.toEqual([]);
  });

  it('reads back the decision taken, derived from the cached advice', async () => {
    await cards.save(sampleCard());
    const decision = sampleDecision();
    await decisions.save(decision);
    await expect(decisions.get(ISSUE)).resolves.toEqual(decision);
  });

  it('reads a refused advice as keeping the ticket for a human', async () => {
    await cards.save(sampleCard());
    await decisions.save({ ...sampleDecision(), taken: 'keep-human', followed: false });
    const back = await decisions.get(ISSUE);
    expect(back?.taken).toBe('keep-human');
    expect(back?.followed).toBe(false);
  });

  it('falls back to the followed flag when no advice was cached', async () => {
    await decisions.save({ ...sampleDecision(), taken: 'delegate', followed: true });
    await expect(decisions.get(ISSUE)).resolves.toMatchObject({ taken: 'delegate' });
  });

  it('keeps the history: a new decision adds a row, nothing is deleted', async () => {
    await decisions.save(sampleDecision(ISSUE, '2026-11-01T09:00:00.000Z'));
    await decisions.save({
      ...sampleDecision(ISSUE, '2026-11-05T09:00:00.000Z'),
      taken: 'keep-human',
      followed: false,
    });
    expect(fake.rowCount('decision')).toBe(2);
    const latest = await decisions.get(ISSUE);
    expect(latest?.at).toBe('2026-11-05T09:00:00.000Z');
    expect(latest?.followed).toBe(false);
  });

  it('leaves one row when the same decision is replayed', async () => {
    await decisions.save(sampleDecision());
    await decisions.save(sampleDecision());
    expect(fake.rowCount('decision')).toBe(1);
  });

  it('lists one project only, latest first, bounded', async () => {
    await decisions.save(sampleDecision('PROJ-1', '2026-11-01T09:00:00.000Z'));
    await decisions.save(sampleDecision('PROJ-2', '2026-11-04T09:00:00.000Z'));
    await decisions.save(sampleDecision('PROJ-3', '2026-11-02T09:00:00.000Z'));
    await decisions.save(sampleDecision('OTHER-1', AT));

    const page = await decisions.listByProject(PROJECT, 2);
    expect(page.map((row) => row.issueId)).toEqual(['PROJ-2', 'PROJ-3']);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await decisions.save(sampleDecision());
    await decisions.get(ISSUE);
    await decisions.listByProject(PROJECT, 10);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});

describe('TrialStore', () => {
  it('answers null and empty lists before any trial', async () => {
    await expect(trials.get('trial-404')).resolves.toBeNull();
    await expect(trials.listByProject(PROJECT)).resolves.toEqual([]);
    await expect(trials.listAssignments('trial-404')).resolves.toEqual([]);
    await expect(trials.getAssignment('trial-404', ISSUE)).resolves.toBeNull();
  });

  it('reads back a trial and its draws', async () => {
    const trial = sampleTrial();
    await trials.save(trial);
    const back = await trials.get('trial-1');
    expect(back?.id).toBe(trial.id);
    expect(back?.cohort).toEqual(trial.cohort);
    expect(back?.state).toBe(trial.state);
    expect(back?.startsAt).toBe(trial.startsAt);
  });

  it('leaves one row when the same trial is replayed', async () => {
    await trials.save(sampleTrial());
    await trials.save(sampleTrial());
    expect(fake.rowCount('trial')).toBe(1);
  });

  it('lists the trials of one project only', async () => {
    await trials.save(sampleTrial('trial-1'));
    await trials.save({ ...sampleTrial('trial-2'), startsAt: '2026-12-01T00:00:00.000Z' });
    await trials.save({ ...sampleTrial('other-1'), projectId: 'OTHER' });
    const list = await trials.listByProject(PROJECT);
    expect(list.map((trial) => trial.id)).toEqual(['trial-2', 'trial-1']);
  });

  it('keeps one assignment per ticket, and replaces it when it changes', async () => {
    const assignment = sampleAssignment();
    await trials.saveAssignment(assignment);
    await trials.saveAssignment(assignment);
    expect(fake.rowCount('trial_assignment')).toBe(1);
    await expect(trials.getAssignment('trial-1', ISSUE)).resolves.toEqual(assignment);

    await trials.saveAssignment({ ...assignment, complied: false, excludedReason: 'draw not respected' });
    expect(fake.rowCount('trial_assignment')).toBe(1);
    const back = await trials.getAssignment('trial-1', ISSUE);
    expect(back?.complied).toBe(false);
    expect(back?.excludedReason).toBe('draw not respected');
  });

  it('lists the draws of one trial only', async () => {
    await trials.saveAssignment(sampleAssignment('PROJ-1'));
    await trials.saveAssignment(sampleAssignment('PROJ-2'));
    await trials.saveAssignment({ ...sampleAssignment('PROJ-3'), trialId: 'trial-2' });
    const draws = await trials.listAssignments('trial-1');
    expect(draws.map((draw) => draw.issueId)).toEqual(['PROJ-1', 'PROJ-2']);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await trials.save(sampleTrial());
    await trials.saveAssignment(sampleAssignment());
    await trials.get('trial-1');
    await trials.listByProject(PROJECT);
    await trials.listAssignments('trial-1');
    await trials.getAssignment('trial-1', ISSUE);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});
