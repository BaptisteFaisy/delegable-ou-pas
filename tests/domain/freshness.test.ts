/**
 * Tests of the freshness contract.
 *
 * The point of the module: the app must never confuse "we did not look" with
 * "there is nothing there", and must say what to do about it. The tests
 * therefore check the four states (including the difference between `missing`
 * and `unknown`), the three verdicts, the actions, and that the clock is
 * injected rather than read.
 */
import { describe, expect, it } from 'vitest';
import {
  ageMinutes,
  assessFreshness,
  collectionBudget,
  stateOf,
} from '../../src/domain/freshness.js';
import type { FreshnessContract } from '../../src/domain/freshness.js';

const NOW = '2026-12-01T12:00:00Z';

function contract(overrides: Partial<FreshnessContract> = {}): FreshnessContract {
  return {
    object: 'commit',
    lastCollectedAt: '2026-12-01T11:50:00Z',
    maxAgeMinutes: 30,
    granted: true,
    probed: true,
    note: { fr: 'lu', en: 'read' },
    ...overrides,
  };
}

describe('fraîcheur des données', () => {
  it('distingue frais, périmé, absent et inconnu', () => {
    expect(stateOf(contract(), NOW)).toBe('fresh');
    expect(stateOf(contract({ lastCollectedAt: '2026-12-01T11:00:00Z' }), NOW)).toBe('stale');
    expect(stateOf(contract({ lastCollectedAt: null }), NOW)).toBe('missing');
    expect(stateOf(contract({ granted: false }), NOW)).toBe('missing');
    expect(stateOf(contract({ probed: false }), NOW)).toBe('unknown');
  });

  it('« absent » et « inconnu » sont deux états différents', () => {
    const missing = stateOf(contract({ granted: false, probed: true }), NOW);
    const unknown = stateOf(contract({ probed: false }), NOW);
    expect(missing).not.toBe(unknown);
  });

  it('calcule l’âge en minutes, et refuse une date illisible', () => {
    expect(ageMinutes('2026-12-01T11:30:00Z', NOW)).toBe(30);
    expect(ageMinutes('pas une date', NOW)).toBeNull();
    expect(ageMinutes(NOW, NOW)).toBe(0);
  });

  it('verdict global : dégradé si une lecture est périmée, bloqué si une manque', () => {
    const ok = assessFreshness([contract()], NOW);
    expect(ok.overall).toBe('ok');
    expect(ok.nextActions).toHaveLength(0);

    const degraded = assessFreshness([contract(), contract({ object: 'pull-request', lastCollectedAt: '2026-12-01T09:00:00Z' })], NOW);
    expect(degraded.overall).toBe('degraded');
    expect(degraded.stale).toBe(1);

    const blocked = assessFreshness([contract({ object: 'user', granted: false })], NOW);
    expect(blocked.overall).toBe('blocked');
    expect(blocked.missing).toBe(1);
  });

  it('dit quoi collecter, et pour quel objet', () => {
    const report = assessFreshness([
      contract({ object: 'pull-request', lastCollectedAt: null, granted: false }),
      contract({ object: 'commit', lastCollectedAt: '2026-12-01T09:00:00Z' }),
    ], NOW);
    expect(report.nextActions.length).toBe(2);
    expect(report.nextActions.join(' ')).toContain('pull-request');
    expect(report.nextActions.join(' ')).toContain('Collecter');
  });

  it('le budget de session dit ce qu’il achète, les absences d’abord', () => {
    const budget = collectionBudget([
      contract({ object: 'commit', lastCollectedAt: '2026-12-01T09:00:00Z' }),
      contract({ object: 'user', granted: false }),
    ], NOW, 2);
    expect(budget.tickets).toBe(2);
    expect(budget.objects[0]).toBe('user');
    expect(budget.objects).toContain('commit');
  });

  it('un budget nul ne promet rien', () => {
    const budget = collectionBudget([contract()], NOW, 0);
    expect(budget.tickets).toBe(0);
  });

  it('le rapport est bilingue', () => {
    const report = assessFreshness([contract()], NOW);
    expect(report.note.fr.length).toBeGreaterThan(10);
    expect(report.note.en.length).toBeGreaterThan(10);
  });
});
