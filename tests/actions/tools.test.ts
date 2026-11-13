/**
 * The nine MCP tools, read side — SPEC §15, §20; DP-11, DP-14, DP-21, DP-22;
 * recipes 10, 13, 14.
 *
 * Every tool answers in the `McpResult` envelope, reads the cache instead of
 * recomputing, and treats absent data as normal (`data: null`, never an
 * exception). Recipe 13: `list-delegable-work` returns ONLY `delegate`
 * tickets, safest first.
 */
import { describe, expect, it } from 'vitest';
import {
  COHORT,
  EPOCH_ID,
  PROJECT,
  sampleCalibration,
  sampleCard,
  sampleCohortStat,
  sampleEpoch,
  sampleSettings,
} from '../db/fixtures.js';
import { createTestApp, fakeSummary, fakeTicket, seedTicket, type TestApp } from '../handlers/app-deps.js';
import { shouldDelegate } from '../../src/actions/should-delegate.js';
import { listDelegableWork } from '../../src/actions/list-delegable-work.js';
import { getDelegationEvidence } from '../../src/actions/get-delegation-evidence.js';
import { getDelegationMap } from '../../src/actions/get-delegation-map.js';
import { getCohort } from '../../src/actions/get-cohort.js';
import { getCalibration } from '../../src/actions/get-calibration.js';
import type { RecommendationEngine } from '../../src/ports.js';
import type { DelegationMap, RecommendationCard } from '../../src/types-advice.js';

async function seeded(): Promise<TestApp> {
  const app = await createTestApp();
  await app.stores.settings.save(sampleSettings());
  await app.stores.epoch.save(sampleEpoch());
  seedTicket(app.jira, fakeTicket('PROJ-1', 'PROJ-1'));
  return app;
}

function cardOf(issueId: string, value: 'delegate' | 'keep-human', confidence: 'high' | 'low'): RecommendationCard {
  return { ...sampleCard(issueId), value, confidence };
}

describe('McpResult envelope', () => {
  it('answers ok/error/data and nothing else', async () => {
    const app = await seeded();
    const result = await shouldDelegate(app.deps, { issueKey: 'PROJ-1' });
    expect(Object.keys(result).sort()).toEqual(['data', 'error', 'ok']);
    expect(result.ok).toBe(true);
    expect(result.error).toBe('');
    expect(result.data).toBeNull(); // no card yet: absence is normal (SPEC §20)
  });
});

describe('should-delegate', () => {
  it('reads the cached card, never recomputes (SPEC §20)', async () => {
    const app = await seeded();
    await app.stores.recommendation.save(sampleCard('PROJ-1'));
    const result = await shouldDelegate(app.deps, { issueKey: 'PROJ-1' });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      issueKey: 'PROJ-1',
      recommendation: 'delegate-with-review',
      confidence: 'medium',
      cohort: COHORT,
      demo: false,
    });
    expect(result.data?.reasons.length).toBeGreaterThan(0);
  });

  it('answers data null for an unknown ticket', async () => {
    const app = await seeded();
    const result = await shouldDelegate(app.deps, { issueKey: 'PROJ-999' });
    expect(result).toEqual({ ok: true, error: '', data: null });
  });
});

describe('list-delegable-work — recipe 13', () => {
  it('returns ONLY delegate tickets, from the safest down', async () => {
    const app = await seeded();
    seedTicket(app.jira, fakeTicket('PROJ-2', 'PROJ-2'));
    seedTicket(app.jira, fakeTicket('PROJ-3', 'PROJ-3'));
    app.jira.search = [fakeSummary('PROJ-1', 'PROJ-1'), fakeSummary('PROJ-2', 'PROJ-2'), fakeSummary('PROJ-3', 'PROJ-3')];
    await app.stores.recommendation.save(cardOf('PROJ-1', 'delegate', 'low'));
    await app.stores.recommendation.save(cardOf('PROJ-2', 'delegate', 'high'));
    await app.stores.recommendation.save(cardOf('PROJ-3', 'keep-human', 'high'));

    const result = await listDelegableWork(app.deps, { jql: 'project = PROJ', limit: 50 });
    expect(result.ok).toBe(true);
    const items = result.data?.items ?? [];
    expect(items.map((item) => item.issueKey)).toEqual(['PROJ-2', 'PROJ-1']);
    expect(items.every((item) => item.confidence !== undefined)).toBe(true);
  });

  it('answers an empty list when nothing is delegable — never an error', async () => {
    const app = await seeded();
    app.jira.search = [fakeSummary('PROJ-1', 'PROJ-1')];
    const result = await listDelegableWork(app.deps, { jql: 'project = PROJ', limit: 10 });
    expect(result).toEqual({ ok: true, error: '', data: { items: [], demo: false } });
  });
});

describe('get-delegation-evidence — recipe 10', () => {
  it('carries the sample sizes and the intervals of both arms', async () => {
    const app = await seeded();
    // The recommendation table keeps the verdict; the figures come from the
    // cohort_stat cache of the current epoch (lot L5 mapping, SPEC §20).
    await app.stores.recommendation.save(sampleCard('PROJ-1'));
    await app.stores.cohortStat.saveMany([sampleCohortStat('agent'), sampleCohortStat('human')]);
    const result = await getDelegationEvidence(app.deps, { issueKey: 'PROJ-1' });
    expect(result.data?.agent).toMatchObject({ n: 26, rate: 0.69, ciLow: 0.5, ciHigh: 0.95 });
    expect(result.data?.human).toMatchObject({ n: 26, rate: 0.87, ciLow: 0.5, ciHigh: 0.95 });
    expect(result.data?.agentLeadTime).toEqual({ n: 26, medianH: 36 });
    expect(result.data?.humanLeadTime).toEqual({ n: 26, medianH: 72 });
    expect(result.data?.conclusion).toBe('same');
    expect(result.data?.balance.balanced).toBe(true);
    expect(result.data?.referenceIssueKeys).toEqual(['PROJ-207', 'PROJ-233']);
  });
});

describe('get-delegation-map', () => {
  const fakeMap: DelegationMap = {
    projectId: PROJECT,
    epochId: EPOCH_ID,
    epochs: [sampleEpoch()],
    natures: ['migration'],
    zones: ['billing'],
    cells: [
      {
        nature: 'migration',
        zone: 'billing',
        color: 'orange',
        recommendation: 'delegate-with-review',
        cohort: COHORT,
        agentN: 26,
        humanN: 31,
        masked: false,
        failureCauses: [],
      },
    ],
    greyShare: 0.25,
    delegableShare: 0.4,
    sprintId: '',
    deviations: [],
    demo: false,
    computedAt: '2027-01-01T00:00:00.000Z',
  };

  it('summarizes the cached map', async () => {
    const engine: RecommendationEngine = {
      compute: async () => null,
      read: async () => null,
      map: async () => fakeMap,
    };
    const app = await createTestApp({ engine });
    await app.stores.settings.save(sampleSettings());
    const result = await getDelegationMap(app.deps, { projectKey: 'PROJ' });
    expect(result.data?.cells).toEqual([
      { nature: 'migration', zone: 'billing', color: 'orange', recommendation: 'delegate-with-review' },
    ]);
    expect(result.data?.greyShare).toBe(0.25);
  });

  it('answers data null when the map is not cached yet', async () => {
    const app = await seeded();
    const result = await getDelegationMap(app.deps, { projectKey: 'PROJ' });
    expect(result).toEqual({ ok: true, error: '', data: null });
  });
});

describe('get-cohort — recipes 11, 14', () => {
  it('answers epoch by epoch, both arms with their sizes', async () => {
    const app = await seeded();
    await app.stores.cohortStat.saveMany([sampleCohortStat('agent'), sampleCohortStat('human')]);
    const result = await getCohort(app.deps, { projectKey: 'PROJ', nature: 'migration', zone: 'billing', size: 'M' });
    expect(result.data?.epochs).toHaveLength(1);
    const epoch = result.data?.epochs[0];
    expect(epoch?.arms).toHaveLength(2);
    expect(epoch?.outdated).toBe(false);
    expect(epoch?.conclusion).toBe('same');
    expect(result.data?.masked).toBe(false);
    expect(result.data?.peopleCount).toBe(4);
  });

  it('masks a cohort carried by fewer than three people (DP-17)', async () => {
    const app = await seeded();
    const narrow = { ...sampleCohortStat('agent'), peopleCount: 1 };
    await app.stores.cohortStat.saveMany([narrow, { ...sampleCohortStat('human'), peopleCount: 1 }]);
    const result = await getCohort(app.deps, { projectKey: 'PROJ', nature: 'migration', zone: 'billing', size: 'M' });
    expect(result.data?.masked).toBe(true);
    expect(result.data?.peopleCount).toBe(0);
  });

  it('answers an explicit empty state for an unknown cohort', async () => {
    const app = await seeded();
    const result = await getCohort(app.deps, { projectKey: 'PROJ', nature: 'nothing', zone: 'nowhere', size: 'S' });
    expect(result.data?.epochs).toEqual([]);
    expect(result.data?.masked).toBe(true); // nobody carries it: masked (recipe 11)
  });
});

describe('get-calibration — DP-21', () => {
  it('reads the cached rows and says up front when the advice adds nothing', async () => {
    const app = await seeded();
    await app.stores.calibration.saveMany([sampleCalibration()]);
    const result = await getCalibration(app.deps, { projectKey: 'PROJ' });
    expect(result.data?.rows).toEqual([
      { recommendation: 'delegate-with-review', n: 18, clean: { n: 18, rate: 0.72, ciLow: 0.5, ciHigh: 0.88 } },
    ]);
    expect(result.data?.adviceAddsNothing).toBe(true); // no "keep-human" side yet (SPEC §10)
  });
});
