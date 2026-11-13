/**
 * The freshness contract of the data, as a screen shows it (SPEC §17, §19;
 * DP-19, recipe 15).
 */
import { describe, expect, it } from 'vitest';
import { freshnessView } from '../../src/viewmodel/freshness.js';
import type { FreshnessContract } from '../../src/domain/freshness.js';

const NOW = '2026-11-13T12:00:00Z';

function contract(over: Partial<FreshnessContract> = {}): FreshnessContract {
  return {
    object: 'commit',
    lastCollectedAt: '2026-11-13T11:30:00Z',
    maxAgeMinutes: 60,
    granted: true,
    probed: true,
    note: { fr: 'lecture fraîche', en: 'fresh read' },
    ...over,
  };
}

describe('freshnessView', () => {
  it('se rend sans contrat', () => {
    const view = freshnessView([], NOW);
    expect(view.lines).toEqual([]);
    expect(view.fresh).toBe(0);
    expect(view.overall.fr.length).toBeGreaterThan(0);
  });

  it('dit qu’une lecture à jour est à jour', () => {
    const view = freshnessView([contract()], NOW);
    expect(view.lines[0].state).toBe('fresh');
    expect(view.lines[0].ageMinutes).toBe(30);
    expect(view.fresh).toBe(1);
    expect(view.overall.fr).toContain('à jour');
  });

  it('distingue périmée, absente et inconnue', () => {
    const view = freshnessView(
      [
        contract({ object: 'commit', lastCollectedAt: '2026-11-13T09:00:00Z' }),
        contract({ object: 'issue', lastCollectedAt: null }),
        contract({ object: 'user', probed: false, granted: false }),
      ],
      NOW,
    );
    expect(view.lines.map((line) => line.state)).toEqual(['stale', 'missing', 'unknown']);
    expect(view.stale).toBe(1);
    expect(view.missing).toBe(1);
    expect(view.unknown).toBe(1);
  });

  it('nomme les actions à prendre', () => {
    const view = freshnessView([contract({ lastCollectedAt: null })], NOW);
    expect(view.nextActions.length).toBeGreaterThan(0);
    expect(view.note.fr).toContain('périmée');
    expect(view.note.en).toContain('stale');
  });

  it('calcule le budget de collecte quand on lui en donne un', () => {
    const view = freshnessView(
      [contract({ object: 'commit' }), contract({ object: 'issue', lastCollectedAt: null })],
      NOW,
      2,
    );
    expect(view.budget).not.toBeNull();
    expect(view.budget?.length).toBeGreaterThan(0);
    expect(view.budget).toContain('issue');
  });

  it('parle français et anglais', () => {
    const view = freshnessView([contract()], NOW);
    expect(view.title.fr).not.toBe(view.title.en);
    expect(view.lines[0].stateLabel.fr).not.toBe(view.lines[0].stateLabel.en);
    expect(view.overall.fr).not.toBe(view.overall.en);
  });
});
