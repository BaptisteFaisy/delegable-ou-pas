/**
 * The write tools, the anonymity sweep and the input validation — SPEC §15,
 * §5, §6, §8; DP-01, DP-13; recipes 12, 13.
 *
 * Recipe 12: no tool accepts a person name, and every answer of the nine
 * tools is swept by the L1 guard before it leaves. Inputs are validated
 * (type, bounds, `limit` capped) and failures are typed, bilingual, short.
 */
import { describe, expect, it } from 'vitest';
import { sampleCard, sampleInvolvement, sampleOutcome, sampleSettings, sampleEpoch } from '../db/fixtures.js';
import { createTestApp, fakeTicket, seedTicket, type TestApp } from '../handlers/app-deps.js';
import { recordInvolvement } from '../../src/actions/record-involvement.js';
import { recordDecision } from '../../src/actions/record-decision.js';
import { reportTakeover } from '../../src/actions/report-takeover.js';
import { shouldDelegate } from '../../src/actions/should-delegate.js';
import { listDelegableWork } from '../../src/actions/list-delegable-work.js';
import { getDelegationEvidence } from '../../src/actions/get-delegation-evidence.js';
import { getDelegationMap } from '../../src/actions/get-delegation-map.js';
import { getCohort } from '../../src/actions/get-cohort.js';
import { getCalibration } from '../../src/actions/get-calibration.js';
import { MCP_ERRORS, guardResult, limitOf, ok } from '../../src/actions/common.js';
import { runTool, toolOf } from '../../src/actions/registry.js';
import { createDispatch } from '../../src/actions/dispatch.js';
import { isPersonSafe } from '../../src/domain/privacy.js';
import { MCP_TOOL_KEYS } from '../../src/types-mcp.js';
import type { McpResult } from '../../src/types-mcp.js';

async function seeded(): Promise<TestApp> {
  const app = await createTestApp();
  await app.stores.settings.save(sampleSettings());
  await app.stores.epoch.save(sampleEpoch());
  seedTicket(app.jira, fakeTicket('PROJ-1', 'PROJ-1'));
  return app;
}

describe('record-involvement — DP-01', () => {
  it('stores the declaration with its source, never a person', async () => {
    const app = await seeded();
    const result = await recordInvolvement(app.deps, {
      issueKey: 'PROJ-1',
      level: 'autonomous',
      client: 'forge-cli',
      model: 'model-a',
      session: 'session-9',
    });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ issueKey: 'PROJ-1', level: 'autonomous', source: 'mcp-declaration' });
    const stored = await app.stores.involvement.get('PROJ-1');
    expect(stored?.sessionRef).toBe('session-9');
    expect(isPersonSafe(result.data)).toBe(true);
  });

  it('refuses an invalid level with a typed bilingual error', async () => {
    const app = await seeded();
    const result = await runTool(app.deps, 'record-involvement', { issueKey: 'PROJ-1', level: 'a-lot', client: 'c', model: 'm', session: 's' });
    expect(result).toEqual({ ok: false, error: MCP_ERRORS['invalid-input'], data: null });
  });
});

describe('record-decision — DP-13', () => {
  it('matches the decision against the cached advice', async () => {
    const app = await seeded();
    await app.stores.recommendation.save(sampleCard('PROJ-1')); // delegate-with-review
    const result = await recordDecision(app.deps, { issueKey: 'PROJ-1', decision: 'delegate', reason: 'criteria ok' });
    expect(result.data).toMatchObject({ recommendation: 'delegate-with-review', followed: true });
    const stored = await app.stores.decision.get('PROJ-1');
    expect(stored?.taken).toBe('delegate');
  });

  it('keeps the decision even without a card: followed false (SPEC §20)', async () => {
    const app = await seeded();
    const result = await recordDecision(app.deps, { issueKey: 'PROJ-1', decision: 'delegate', reason: '' });
    expect(result.data).toMatchObject({ recommendation: 'not-enough-data', followed: false });
  });
});

describe('report-takeover — SPEC §6', () => {
  it('falls autonomous back to driven and flags the outcome', async () => {
    const app = await seeded();
    await app.stores.involvement.save({ ...sampleInvolvement('PROJ-1'), level: 'autonomous' });
    await app.stores.outcome.save(sampleOutcome('PROJ-1'));
    const result = await reportTakeover(app.deps, { issueKey: 'PROJ-1', reason: 'the agent looped' });
    expect(result.data).toMatchObject({ issueKey: 'PROJ-1', level: 'driven' });
    const stored = await app.stores.involvement.get('PROJ-1');
    expect(stored?.evidence).toEqual(['takeover-reported']); // structured keys, never the quote (SPEC §17)
    const outcome = await app.stores.outcome.get('PROJ-1');
    expect(outcome?.takeover).toBe(true);
  });
});

describe('recipe 12 — the anonymity sweep over the nine tools', () => {
  it('every answer of every tool carries no person identifier', async () => {
    const app = await seeded();
    await app.stores.recommendation.save(sampleCard('PROJ-1'));
    await app.stores.involvement.save(sampleInvolvement('PROJ-1'));
    const answers: McpResult<unknown>[] = [
      await shouldDelegate(app.deps, { issueKey: 'PROJ-1' }),
      await listDelegableWork(app.deps, { jql: 'project = PROJ', limit: 10 }),
      await getDelegationEvidence(app.deps, { issueKey: 'PROJ-1' }),
      await getDelegationMap(app.deps, { projectKey: 'PROJ' }),
      await getCohort(app.deps, { projectKey: 'PROJ', nature: 'migration', zone: 'billing', size: 'M' }),
      await getCalibration(app.deps, { projectKey: 'PROJ' }),
      await recordInvolvement(app.deps, { issueKey: 'PROJ-1', level: 'driven', client: 'c', model: 'm', session: 's' }),
      await recordDecision(app.deps, { issueKey: 'PROJ-1', decision: 'keep-human', reason: 'r' }),
      await reportTakeover(app.deps, { issueKey: 'PROJ-1', reason: 'r' }),
    ];
    expect(answers).toHaveLength(MCP_TOOL_KEYS.length);
    for (const answer of answers) {
      expect(isPersonSafe(answer.data)).toBe(true);
      expect(isPersonSafe(answer.error)).toBe(true);
    }
  });

  it('withholds an answer that would carry a person identifier', async () => {
    const app = await seeded();
    const dirty = ok({ issueKey: 'PROJ-1', reporter: 'Alice' });
    const guarded = guardResult(app.deps, 'should-delegate', dirty);
    expect(guarded).toEqual({ ok: false, error: MCP_ERRORS['privacy-leak'], data: null });
    expect(app.logger.entries.some((entry) => entry.message.includes('privacy leak'))).toBe(true);
  });
});

describe('input validation — SPEC §15, §19', () => {
  it('caps the limit and defaults it', () => {
    expect(limitOf(5000)).toBe(100);
    expect(limitOf(0)).toBe(1);
    expect(limitOf('ten')).toBe(50);
    expect(limitOf(2.5)).toBe(50);
  });

  it('refuses a malformed issue key', async () => {
    const app = await seeded();
    const result = await shouldDelegate(app.deps, { issueKey: 'not a key' });
    // the typed function trusts its frozen input; the runner validates:
    const viaRunner = await runTool(app.deps, 'should-delegate', { issueKey: 'not a key' });
    expect(viaRunner).toEqual({ ok: false, error: MCP_ERRORS['invalid-input'], data: null });
    expect(result.ok).toBe(true); // getTicket answers null → data null
  });

  it('routes by tool key and fails an unknown tool with a typed error', async () => {
    const app = await seeded();
    expect(toolOf('fn-should-delegate', undefined)).toBe('should-delegate');
    expect(toolOf(undefined, 'fn-get-cohort')).toBe('get-cohort');
    const dispatch = createDispatch(app.deps);
    const result = (await dispatch({ tool: 'not-a-tool' })) as McpResult<unknown>;
    expect(result).toEqual({ ok: false, error: MCP_ERRORS['unknown-tool'], data: null });
  });
});
