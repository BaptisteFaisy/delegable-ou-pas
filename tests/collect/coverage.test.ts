/**
 * Tests de la sonde de couverture (recette 15 : distinguer droit manquant et
 * absence de données) et de l'assembleur d'écran de couverture (DP-19).
 * Aucun réseau.
 */
import { describe, it, expect } from 'vitest';
import { createStubRepository } from '../../src/db/stub.js';
import { createCoverageProber } from '../../src/collect/checker.js';
import { createCoverageBuilder } from '../../src/collect/coverage.js';
import { GRAPH_OBJECT_TYPES } from '../../src/types.js';
import { commit, fakeClock, fakeGraph } from './fakes.js';

describe('sonde de couverture (recette 15)', () => {
  it('droit accordé + données → ok', async () => {
    const prober = createCoverageProber({
      graph: fakeGraph({ probe: 'granted', commits: { 'PROJ-1': [commit('c1', 'x')] } }),
      clock: fakeClock(),
    });
    const probe = await prober.probe('commit', 'PROJ-1');
    expect(probe.state).toBe('ok');
    expect(probe.evidence).toBeGreaterThan(0);
  });

  it('droit accordé + aucune donnée → pas-de-données', async () => {
    const prober = createCoverageProber({ graph: fakeGraph({ probe: 'granted', commits: {} }), clock: fakeClock() });
    const probe = await prober.probe('commit', 'PROJ-1');
    expect(probe.state).toBe('no-data');
    expect(probe.evidence).toBe(0);
  });

  it('droit manquant → droit-manquant (jamais un zéro silencieux)', async () => {
    const prober = createCoverageProber({ graph: fakeGraph({ probe: 'missing', commits: {} }), clock: fakeClock() });
    const probe = await prober.probe('commit', 'PROJ-1');
    expect(probe.state).toBe('missing-right');
  });

  it('droit inconnu → inconnu', async () => {
    const prober = createCoverageProber({ graph: fakeGraph({ probe: 'unknown' }), clock: fakeClock() });
    expect((await prober.probe('pull-request', 'PROJ-1')).state).toBe('unknown');
  });

  it('sonde un type utilisateur via un compte d’auteur', async () => {
    const prober = createCoverageProber({
      graph: fakeGraph({ probe: 'granted', commits: { 'PROJ-1': [commit('c1', 'x', { authorAccountId: 'a1' })] }, botAccounts: ['a1'] }),
      clock: fakeClock(),
    });
    const probe = await prober.probe('user', 'PROJ-1');
    expect(probe.state).toBe('ok');
    expect(probe.evidence).toBe(1);
  });
});

describe('écran de couverture', () => {
  it('assemble droits, dernière collecte et implication connue', async () => {
    const repo = await createStubRepository();
    await repo.stores.graphCursor.save({
      projectId: 'PROJ', objectType: 'commit', lastIssueId: 'PROJ-3', lastRunAt: '2026-11-01T10:00:00.000Z',
    });
    const builder = createCoverageBuilder({
      involvement: repo.stores.involvement,
      cursors: repo.stores.graphCursor,
      settings: repo.stores.settings,
      graph: fakeGraph({ permission: 'granted' }),
      clock: fakeClock('2026-11-02T00:00:00.000Z'),
    });

    const coverage = await builder.build('PROJ');
    expect(coverage.projectId).toBe('PROJ');
    expect(coverage.permissions.map((p) => p.objectType)).toEqual([...GRAPH_OBJECT_TYPES]);
    expect(coverage.permissions.every((p) => p.state === 'granted')).toBe(true);
    expect(coverage.lastCollectionAt).toBe('2026-11-01T10:00:00.000Z');
    expect(coverage.lastCollectionOk).toBe(true);
    expect(coverage.demo).toBe(false);
    expect(coverage.knownIssues).toBe(0);
    expect(coverage.totalIssues).toBe(0);
  });

  it('aucune collecte → date vide et ok=false', async () => {
    const repo = await createStubRepository();
    const builder = createCoverageBuilder({
      involvement: repo.stores.involvement,
      cursors: repo.stores.graphCursor,
      settings: repo.stores.settings,
      graph: fakeGraph({ permission: 'missing' }),
      clock: fakeClock(),
    });
    const coverage = await builder.build('PROJ');
    expect(coverage.lastCollectionAt).toBe('');
    expect(coverage.lastCollectionOk).toBe(false);
    expect(coverage.permissions.every((p) => p.state === 'missing')).toBe(true);
  });
});