/**
 * Tests of `src/domain/maturity.ts` — DP-04, SPEC §6, SPEC §20, §21, recipe 5.
 * The clock is a parameter: no test reads the system time.
 */
import { describe, expect, it } from 'vitest';

import type { Outcome } from '../../src/types.js';
import {
  CLEAN_WINDOW_DAYS,
  REOPENING_WINDOW_DAYS,
  isMature,
  judgeable,
  judgeableAt,
  maturityDate,
  maturitySplit,
} from '../../src/domain/maturity.js';

/** The instant the tests read the world at, injected like the runtime does. */
const NOW = '2026-12-15T09:00:00Z';

/** Builds an outcome closed `closedAt`, reopened or not. */
function outcome(closedAt: string, reopened = false): Outcome {
  return {
    issueId: 'DOP-1',
    closedAt,
    leadTimeH: 12,
    reopened,
    causedBugs: 0,
    neighborBugs: 0,
    incidents: 0,
    takeover: false,
    abandoned: false,
    clean: !reopened,
    matureAt: '',
  };
}

describe('maturité des tickets', () => {
  it('emploie trente jours pour une réouverture et soixante pour une clôture propre', () => {
    expect(REOPENING_WINDOW_DAYS).toBe(30);
    expect(CLEAN_WINDOW_DAYS).toBe(60);
  });

  it('rend la date de maturité soixante jours après la clôture', () => {
    expect(maturityDate('2026-01-15')).toBe('2026-03-16');
  });

  it('conserve l’heure d’un instant complet', () => {
    expect(maturityDate('2026-01-15T10:00:00Z')).toBe('2026-03-16T10:00:00.000Z');
  });

  it('ne rend aucune date quand la clôture est absente', () => {
    expect(maturityDate('')).toBe('');
    expect(judgeableAt(outcome(''))).toBe('');
  });

  it('recette-05 : un ticket clos il y a 10 jours sort du taux mais reste visible', () => {
    const recent = outcome('2026-12-05T09:00:00Z');
    const all = [recent];
    expect(isMature(recent, NOW)).toBe(false);
    expect(judgeable(all, NOW)).toEqual([]);
    expect(all).toHaveLength(1);
  });

  it('considère un ticket clos il y a 61 jours comme mûr', () => {
    expect(isMature(outcome('2026-10-15T09:00:00Z'), NOW)).toBe(true);
  });

  it('attend le soixantième jour avant de juger une clôture propre', () => {
    expect(isMature(outcome('2026-10-17T09:00:00Z'), NOW)).toBe(false);
    expect(isMature(outcome('2026-10-16T09:00:00Z'), NOW)).toBe(true);
  });

  it('juge un ticket réouvert trente jours après sa clôture', () => {
    expect(isMature(outcome('2026-11-16T09:00:00Z', true), NOW)).toBe(false);
    expect(isMature(outcome('2026-11-15T09:00:00Z', true), NOW)).toBe(true);
    expect(judgeableAt(outcome('2026-11-15T09:00:00Z', true))).toBe('2026-12-15T09:00:00.000Z');
  });

  it('ne juge jamais un ticket encore ouvert', () => {
    expect(isMature(outcome(''), NOW)).toBe(false);
    expect(isMature(outcome(''), '2099-01-01T00:00:00Z')).toBe(false);
  });

  it('sépare les tickets mûrs des tickets immatures et rend les deux effectifs', () => {
    const outcomes = [
      outcome('2026-10-15T09:00:00Z'),
      outcome('2026-12-05T09:00:00Z'),
      outcome('2026-11-15T09:00:00Z', true),
    ];
    expect(maturitySplit(outcomes, NOW)).toEqual({ mature: 2, immature: 1, total: 3 });
    expect(judgeable(outcomes, NOW).map((item) => item.closedAt)).toEqual([
      '2026-10-15T09:00:00Z',
      '2026-11-15T09:00:00Z',
    ]);
  });

  it('rend un jeu vide sans exception', () => {
    expect(judgeable([], NOW)).toEqual([]);
    expect(maturitySplit([], NOW)).toEqual({ mature: 0, immature: 0, total: 0 });
  });

  it('prend l’horloge en paramètre, jamais l’heure du système', () => {
    const ticket = outcome('2026-12-05T09:00:00Z');
    expect(isMature(ticket, '2026-12-06T09:00:00Z')).toBe(false);
    expect(isMature(ticket, '2027-03-01T09:00:00Z')).toBe(true);
    expect(isMature(ticket, 'pas-une-date')).toBe(false);
  });
});
