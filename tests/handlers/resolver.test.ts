/**
 * The unique resolver — SPEC §16, §17; DP-15.
 *
 * The manifest points every UI Kit 2 module at `handlers/resolver.handler`.
 * These tests drive the resolver built on the fake app (no Forge runtime):
 * one method per screen, domain payloads, and an unknown method that answers
 * nothing instead of throwing.
 */
import { describe, expect, it } from 'vitest';
import { sampleCard, sampleEpoch, sampleSettings } from '../db/fixtures.js';
import { createTestApp, fakeTicket, seedTicket } from './app-deps.js';
import { createResolver, handler, resetResolver } from '../../src/handlers/resolver.js';
import { SCREEN_METHODS } from '../../src/handlers/screens.js';

function invoke(resolver: ReturnType<typeof createResolver>, functionKey: string, payload: unknown, context: unknown) {
  return resolver.getDefinitions()({ call: { functionKey, payload }, context } as never);
}

describe('handlers/resolver', () => {
  it('defines every method the screens call (interface with L8)', async () => {
    const app = await createTestApp();
    const resolver = createResolver(app.deps);
    for (const method of SCREEN_METHODS) {
      const answered = await invoke(resolver, method, {}, {});
      // every route answers something (often an explicit empty state), never throws
      expect(answered === null || typeof answered === 'object').toBe(true);
    }
  });

  it('answers the ticket panel with the cached card', async () => {
    const app = await createTestApp();
    await app.stores.settings.save(sampleSettings());
    await app.stores.epoch.save(sampleEpoch());
    seedTicket(app.jira, fakeTicket('PROJ-1', 'PROJ-1'));
    await app.stores.recommendation.save(sampleCard('PROJ-1'));
    const resolver = createResolver(app.deps);
    const payload = (await invoke(resolver, 'issue-panel', {}, { extension: { issue: { id: 'PROJ-1', key: 'PROJ-1' } } })) as {
      card: { issueId: string } | null;
    };
    expect(payload.card).toMatchObject({ issueId: 'PROJ-1' });
  });

  it('exposes the manifest entry and its reset hook', () => {
    expect(typeof handler).toBe('function');
    expect(typeof resetResolver).toBe('function');
  });
});
