/**
 * The Forge entry points — SPEC §15, §16, §17, §19; DP-15, DP-18, DP-24.
 *
 * The `fn-*` dispatch routes on `context.moduleKey`; the unique resolver
 * answers the screens with DOMAIN payloads; the JQL function reads the nightly
 * cache; the events refresh one ticket without ever throwing; the nightly pass
 * is sliced and resumes on stale cards (DP-18).
 */
import { describe, expect, it } from 'vitest';
import {
  AT,
  EPOCH_ID,
  PROJECT,
  sampleCard,
  sampleDecision,
  sampleEpoch,
  sampleInvolvement,
  sampleOutcome,
  sampleIssueClass,
  sampleSettings,
} from '../db/fixtures.js';
import {
  closedHistory,
  createTestApp,
  fakeSummary,
  fakeTicket,
  seedTicket,
  TEST_NOW,
  type TestApp,
} from './app-deps.js';
import { dispatch, runDispatch } from '../../src/handlers/dispatch.js';
import { eventType, onEvent } from '../../src/handlers/events.js';
import { jqlDelegable, runJqlDelegable } from '../../src/handlers/jql.js';
import { routeScreen } from '../../src/handlers/screens.js';
import { NIGHTLY_BUDGET_MS, onScheduled, recomputeProject } from '../../src/handlers/scheduled.js';
import { routeEntry } from '../../src/handlers/entry.js';
import type { McpResult } from '../../src/types-mcp.js';

async function seeded(): Promise<TestApp> {
  const app = await createTestApp();
  await app.stores.settings.save(sampleSettings());
  await app.stores.epoch.save(sampleEpoch());
  seedTicket(app.jira, fakeTicket('PROJ-1', 'PROJ-1'));
  return app;
}

describe('handlers/dispatch — the nine fn-* on one export', () => {
  it('routes context.moduleKey to the right tool', async () => {
    const app = await seeded();
    await app.stores.recommendation.save(sampleCard('PROJ-1'));
    const result = (await runDispatch(app.deps, { issueKey: 'PROJ-1' }, { moduleKey: 'fn-should-delegate' })) as McpResult<unknown>;
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ issueKey: 'PROJ-1', recommendation: 'delegate-with-review' });
  });

  it('fails an empty module key with the typed unknown-tool error', async () => {
    const app = await seeded();
    const result = (await runDispatch(app.deps, {}, {})) as McpResult<unknown>;
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('exposes the manifest entry `dispatch`, wired on the shared deps', () => {
    // Calling it live would build the Forge repository (no runtime here): the
    // contract checked is the export the manifest points at (CONTRACTS.md §6).
    expect(typeof dispatch).toBe('function');
  });
});

describe('handlers/jql — issue in delegable()', () => {
  it('returns the bounded ids of the cached delegate cards', async () => {
    const app = await seeded();
    await app.stores.recommendation.save({ ...sampleCard('PROJ-1'), value: 'delegate' });
    await app.stores.recommendation.save({ ...sampleCard('PROJ-2'), value: 'keep-human' });
    const result = await runJqlDelegable(app.deps, { projectKey: PROJECT });
    expect(result.issueIds).toEqual(['PROJ-1']);
  });

  it('exposes the manifest entry `jqlDelegable`', () => {
    expect(typeof jqlDelegable).toBe('function');
  });
});

describe('handlers/screens — the unique resolver', () => {
  it('answers the ticket panel with domain data (SPEC §16.1)', async () => {
    const app = await seeded();
    await app.stores.recommendation.save(sampleCard('PROJ-1'));
    await app.stores.decision.save(sampleDecision('PROJ-1'));
    await app.stores.involvement.save(sampleInvolvement('PROJ-1'));
    const payload = (await routeScreen(app.deps, 'issue-panel', {}, { extension: { issue: { id: 'PROJ-1', key: 'PROJ-1' } } })) as Record<string, unknown>;
    expect(payload.card).toMatchObject({ issueId: 'PROJ-1' });
    expect(payload.decision).toMatchObject({ taken: 'delegate' });
    expect(payload.involvement).toMatchObject({ level: 'driven' });
  });

  it('answers the project page: map, coverage, calibration (SPEC §16.2)', async () => {
    const app = await seeded();
    const payload = (await routeScreen(app.deps, 'project-page', {}, { extension: { project: { id: PROJECT } } })) as Record<string, unknown>;
    expect(payload.map).toBeNull(); // engine.map is the L4 stub: null is normal
    expect(payload.calibrationRows).toEqual([]);
    expect(payload.adviceAddsNothing).toBe(true); // no row: the app says it up front (SPEC §10)
  });

  it('answers the settings page with the catalogue and the epochs', async () => {
    const app = await seeded();
    const payload = (await routeScreen(app.deps, 'settings', {}, { extension: { project: { id: PROJECT } } })) as Record<string, unknown>;
    expect(payload.settings).toMatchObject({ projectKey: PROJECT, minArmSize: 20 });
    expect(payload.epochs).toHaveLength(1);
  });

  it('splits the sprint: only delegates, with the share of points (DP-24)', async () => {
    const app = await seeded();
    seedTicket(app.jira, fakeTicket('PROJ-2', 'PROJ-2'));
    app.jira.sprint = [fakeSummary('PROJ-1', 'PROJ-1', 3), fakeSummary('PROJ-2', 'PROJ-2', 2)];
    await app.stores.recommendation.save({ ...sampleCard('PROJ-1'), value: 'delegate' });
    await app.stores.recommendation.save({ ...sampleCard('PROJ-2'), value: 'keep-human' });
    const payload = (await routeScreen(app.deps, 'sprint-split', {}, { extension: { sprint: { id: 'sprint-1' } } })) as {
      items: { issueKey: string }[];
      delegableShare: number;
      sprintId: string;
    };
    expect(payload.items.map((item) => item.issueKey)).toEqual(['PROJ-1']);
    expect(payload.delegableShare).toBeCloseTo(0.6);
    expect(payload.sprintId).toBe('sprint-1');
  });

  it('records a decision from the panel button, then an unknown method answers null', async () => {
    const app = await seeded();
    await app.stores.recommendation.save(sampleCard('PROJ-1'));
    const data = await routeScreen(
      app.deps,
      'record-decision',
      { decision: 'delegate', reason: '' },
      { extension: { issue: { id: 'PROJ-1', key: 'PROJ-1' } } },
    );
    expect(data).toMatchObject({ followed: true });
    expect(await routeScreen(app.deps, 'not-a-method', {}, {})).toBeNull();
  });
});

describe('handlers/events — created and updated', () => {
  it('reads the kind of event defensively', () => {
    expect(eventType({ webhookInfo: { type: 'avi:jira:created:issue' } })).toBe('created');
    expect(eventType({ type: 'avi:jira:updated:issue' })).toBe('updated');
    expect(eventType({})).toBe('unknown');
  });

  it('classifies the nature of a new ticket (DP-06)', async () => {
    const app = await seeded();
    await onEvent(app.deps, { webhookInfo: { type: 'avi:jira:created:issue' }, issue: { id: 'PROJ-1', key: 'PROJ-1' } });
    const stored = await app.stores.issueClass.get('PROJ-1');
    expect(stored?.nature).toBe('migration'); // the fake model answers the first declared nature
  });

  it('refreshes involvement and outcome at closure, without blocking (SPEC §17)', async () => {
    const app = await seeded();
    await app.stores.involvement.save(sampleInvolvement('PROJ-1')); // mcp-declaration wins (DP-01)
    app.jira.histories.set('PROJ-1', closedHistory('PROJ-1', '2026-11-02T09:00:00.000Z'));
    await onEvent(app.deps, { webhookInfo: { type: 'avi:jira:updated:issue' }, issue: { id: 'PROJ-1', key: 'PROJ-1' } });
    const outcome = await app.stores.outcome.get('PROJ-1');
    expect(outcome?.closedAt).toBe('2026-11-02T09:00:00.000Z');
    expect(outcome?.clean).toBe(true);
    expect(outcome?.matureAt).not.toBe('');
    const involvement = await app.stores.involvement.get('PROJ-1');
    expect(involvement?.source).toBe('mcp-declaration'); // the strongest source stands
  });

  it('logs a failure instead of throwing (SPEC §20)', async () => {
    const app = await seeded();
    app.jira.tickets.clear();
    app.jira.getTicket = async () => {
      throw new Error('network down');
    };
    await expect(onEvent(app.deps, { webhookInfo: { type: 'avi:jira:updated:issue' }, issue: { id: '1' } })).resolves.toBeUndefined();
    expect(app.logger.entries.some((entry) => entry.level === 'error')).toBe(true);
  });
});

describe('handlers/scheduled — the sliced nightly pass', () => {
  async function nightlyApp(): Promise<TestApp> {
    const app = await seeded();
    await app.stores.issueClass.save(sampleIssueClass('PROJ-1'));
    await app.stores.involvement.save(sampleInvolvement('PROJ-1'));
    await app.stores.outcome.save(sampleOutcome('PROJ-1')); // matureAt 2027-01-01 < TEST_NOW
    return app;
  }

  it('recomputes cohorts, calibration and the stale cards, then caches', async () => {
    const app = await nightlyApp();
    const report = await recomputeProject(app.deps, sampleSettings());
    expect(report.cohortRows).toBe(2); // both arms of the cohort, one epoch
    expect(report.cards).toBe(1); // PROJ-1 matured and had no card
    const lastComputed = await app.stores.cohortStat.lastComputedAt(PROJECT);
    expect(lastComputed).toBe(TEST_NOW);
    const card = await app.stores.recommendation.get('PROJ-1');
    expect(card?.computedAt).toBe(TEST_NOW);
    expect(card?.cohort.nature).toBe('migration');
  });

  it('resumes on stale cards only: a second pass rebuilds nothing (DP-18)', async () => {
    const app = await nightlyApp();
    await recomputeProject(app.deps, sampleSettings());
    const second = await recomputeProject(app.deps, sampleSettings());
    expect(second.cards).toBe(0); // the card is newer than the maturity
  });

  it('stops on the budget and reports it (SPEC §19: under 900 s)', async () => {
    const app = await nightlyApp();
    await app.stores.settings.save({ ...sampleSettings('PROJ-2'), projectKey: 'PROJ-2' });
    app.clock.set(TEST_NOW);
    let calls = 0;
    const stepping = {
      now: () => {
        calls += 1;
        return new Date(Date.parse(TEST_NOW) + calls * (NIGHTLY_BUDGET_MS / 2 + 60_000)).toISOString();
      },
    };
    const deps = { ...app.deps, clock: stepping };
    const report = await onScheduled(deps);
    expect(report.projects).toBe(2);
    expect(report.stoppedEarly).toBe(true);
    expect(report.reports.length).toBeLessThan(2);
  });
});

describe('handlers/entry — the generic router of src/index.ts', () => {
  it('routes a screen method, a tool and an event by shape', async () => {
    const app = await seeded();
    await app.stores.recommendation.save(sampleCard('PROJ-1'));
    const screen = (await routeEntry(app.deps, { method: 'issue-panel', payload: {}, context: { extension: { issue: { id: 'PROJ-1' } } } })) as Record<string, unknown>;
    expect(screen.card).toMatchObject({ issueId: 'PROJ-1' });
    const tool = (await routeEntry(app.deps, { tool: 'should-delegate', issueKey: 'PROJ-1' })) as McpResult<unknown>;
    expect(tool.ok).toBe(true);
    expect(await routeEntry(app.deps, { nothing: 'known' })).toBeNull();
    expect(AT).not.toBe(''); // fixture sanity
    expect(EPOCH_ID).not.toBe('');
  });
});
