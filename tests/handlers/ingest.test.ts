/**
 * The session ingest — SPEC §17 "Graphe : la session d'un utilisateur"; DP-18.
 *
 * The slice is planned with the frozen L6 prioritisation and worked by the
 * frozen L5 collector: these tests check the wiring (candidates, budget,
 * cursor) with fakes only — no network, no Forge.
 */
import { describe, expect, it } from 'vitest';
import { PROJECT, sampleCommitFact, sampleEpoch, sampleInvolvement, sampleIssueClass, sampleOutcome, sampleSettings } from '../db/fixtures.js';
import { createTestApp } from './app-deps.js';
import {
  DEFAULT_SLICE_SIZE,
  createIngestQueue,
  planSessionSlice,
  runIngestSlice,
  sessionCandidates,
} from '../../src/handlers/ingest.js';
import { DEFAULT_BUDGET_MINUTES } from '../../src/collect/priority.js';
import type { CollectionJob } from '../../src/ports.js';

async function seeded() {
  const app = await createTestApp();
  await app.stores.settings.save(sampleSettings());
  await app.stores.epoch.save(sampleEpoch());
  await app.stores.issueClass.save(sampleIssueClass('PROJ-1'));
  await app.stores.involvement.save(sampleInvolvement('PROJ-1'));
  await app.stores.outcome.save(sampleOutcome('PROJ-1'));
  await app.stores.commitFact.saveMany([sampleCommitFact('PROJ-1')]);
  return app;
}

const JOB: CollectionJob = {
  projectId: PROJECT,
  objectType: 'commit',
  fromIssueId: '',
  sliceSize: DEFAULT_SLICE_SIZE,
  enqueuedAt: '2027-02-01T09:00:00.000Z',
};

describe('session ingest', () => {
  it('builds the candidates from the coverage map, not from the network', async () => {
    const app = await seeded();
    const candidates = await sessionCandidates(app.deps, PROJECT);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ issueId: 'PROJ-1', alreadyCollected: true, commitsSigned: true });
  });

  it('plans one bounded slice with the session budget (DP-18)', async () => {
    const app = await seeded();
    const slice = await planSessionSlice(app.deps, sampleSettings());
    expect(slice.budgetMinutes).toBe(DEFAULT_BUDGET_MINUTES);
    expect(slice.issueIds.length).toBeLessThanOrEqual(DEFAULT_SLICE_SIZE);
  });

  it('works a slice through the collector and answers the slice it stored', async () => {
    const app = await seeded();
    app.jira.search = []; // no more ticket to collect: the slice closes
    const slice = await runIngestSlice(app.deps, JOB);
    expect(slice.projectId).toBe(PROJECT);
    expect(slice.objectType).toBe('commit');
    expect(slice.issueIds).toEqual([]);
  });

  it('the queue works its jobs inline, inside the session (SPEC §17)', async () => {
    const app = await seeded();
    app.jira.search = [];
    const queue = createIngestQueue(app.deps);
    await expect(queue.publish(JOB)).resolves.toBeUndefined();
  });
});
