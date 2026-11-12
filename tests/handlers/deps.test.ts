/**
 * The single assembly — SPEC §17, §13; DP-20.
 *
 * `buildDeps` is the only place that instantiates anything: the demo switch
 * swaps the real gateways for the in-memory repository (DP-20), the overrides
 * win (tests), and the shared singleton is what the manifest entries use.
 */
import { describe, expect, it } from 'vitest';
import {
  buildDeps,
  counterIds,
  getDeps,
  inertGraph,
  inertJira,
  inertLlm,
  resetDeps,
  seededRandom,
  systemClock,
} from '../../src/deps.js';
import { sampleSettings } from '../db/fixtures.js';

describe('buildDeps — demo mode (DP-20)', () => {
  it('branches the in-memory repository and inert gateways', async () => {
    const deps = await buildDeps({ demo: true });
    expect(await deps.jira.getTicket('PROJ-1')).toBeNull();
    expect(await deps.graph.commitsOfIssue('x')).toEqual([]);
    expect(await deps.settings.list(10)).toEqual([]);
    // the stores are real: the sample dataset of lot L9 seeds through them
    await deps.settings.save(sampleSettings());
    expect(await deps.settings.get('PROJ')).toMatchObject({ projectKey: 'PROJ' });
  });

  it('keeps every override the caller provides', async () => {
    const jira = inertJira();
    const graph = inertGraph();
    const llm = inertLlm();
    const deps = await buildDeps({ demo: true, jira, graph, llm });
    expect(deps.jira).toBe(jira);
    expect(deps.graph).toBe(graph);
    expect(deps.llm).toBe(llm);
    expect(deps.settings).toBe(deps.stores.settings); // one source for the settings
  });
});

describe('buildDeps — injected primitives', () => {
  it('the clock answers ISO 8601', () => {
    expect(Number.isNaN(Date.parse(systemClock().now()))).toBe(false);
  });

  it('the randomness is reproducible from a seed (SPEC §11)', () => {
    const random = seededRandom();
    expect(random.nextInt('seed-1', 10)).toBe(random.nextInt('seed-1', 10));
    expect(random.nextInt('seed-1', 10)).toBeGreaterThanOrEqual(0);
    const arm = random.drawArm('seed-1', 'PROJ-1');
    expect(arm === 'agent' || arm === 'human').toBe(true);
    expect(random.drawArm('seed-1', 'PROJ-1')).toBe(arm);
  });

  it('the identifiers are prefixed and counting', () => {
    const ids = counterIds();
    expect(ids.next('ep')).toBe('ep-1');
    expect(ids.next('ep')).toBe('ep-2');
  });
});

describe('getDeps — the shared singleton', () => {
  it('builds once, rebuilds after reset', async () => {
    resetDeps();
    const first = await getDeps({ demo: true });
    const second = await getDeps({ demo: true });
    expect(first).toBe(second);
    resetDeps();
    const third = await getDeps({ demo: true });
    expect(third).not.toBe(first);
    resetDeps();
  });
});
