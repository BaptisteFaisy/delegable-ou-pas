/**
 * Tests of `src/domain/survival.ts` — SPEC §6, DP-04.
 *
 * Kaplan-Meier (ties folded, censoring respected, median by first crossing or
 * `null`), the log-rank test (hypergeometric variance, honest empty arms) and
 * the chi-squared upper tail implemented on site and checked against known
 * values, with no external table and no randomness.
 */
import { describe, expect, it } from 'vitest';

import type { SurvivalObservation } from '../../src/domain/survival.js';
import {
  censoredShare,
  chi2UpperTail,
  kaplanMeier,
  logRank,
} from '../../src/domain/survival.js';

/** Builds an arm of consecutive, all-event durations. */
function closedAt(durations: readonly number[]): SurvivalObservation[] {
  return durations.map((durationH) => ({ durationH, event: true }));
}

describe('queue supérieure du chi²', () => {
  it('rend ~0,05 pour χ² = 3,841 à 1 ddl', () => {
    expect(Math.abs(chi2UpperTail(3.841) - 0.05)).toBeLessThan(0.002);
  });

  it('rend ~0,01 pour χ² = 6,635 à 1 ddl', () => {
    expect(Math.abs(chi2UpperTail(6.635) - 0.01)).toBeLessThan(0.002);
  });

  it('rend exactement 1 pour χ² = 0', () => {
    expect(chi2UpperTail(0)).toBe(1);
  });

  it('tend vers 0 pour un χ² très grand', () => {
    expect(chi2UpperTail(400)).toBeLessThan(1e-10);
  });

  it('reste correcte pour df = 2 (χ² = 2 → e⁻¹ ≈ 0,3679)', () => {
    expect(Math.abs(chi2UpperTail(2, 2) - Math.exp(-1))).toBeLessThan(0.002);
  });
});

describe('Kaplan-Meier', () => {
  it('déroule la courbe et interpole la médiane au passage de 0,5', () => {
    const curve = kaplanMeier(closedAt([1, 2, 3]));
    expect(curve.n).toBe(3);
    expect(curve.censored).toBe(0);
    expect(curve.points).toHaveLength(3);
    expect(curve.points[0]).toMatchObject({ t: 1, atRisk: 3, events: 1 });
    expect(curve.points[0].survival).toBeCloseTo(2 / 3, 12);
    expect(curve.points[1].survival).toBeCloseTo(1 / 3, 12);
    expect(curve.points[2].survival).toBe(0);
    expect(curve.medianH).toBe(1.5);
  });

  it('plie les ex-aequo en un seul point avec le bon facteur', () => {
    const curve = kaplanMeier(closedAt([1, 1, 2]));
    expect(curve.points).toHaveLength(2);
    expect(curve.points[0]).toMatchObject({ t: 1, atRisk: 3, events: 2 });
    expect(curve.points[0].survival).toBeCloseTo(1 / 3, 12);
  });

  it('rend une médiane nulle quand rien ne ferme (tout censuré)', () => {
    const curve = kaplanMeier([
      { durationH: 1, event: false },
      { durationH: 2, event: false },
    ]);
    expect(curve.censored).toBe(2);
    expect(curve.points).toHaveLength(0);
    expect(curve.medianH).toBeNull();
  });

  it('rend une médiane nulle quand la courbe ne descend jamais sous 0,5', () => {
    const curve = kaplanMeier([
      { durationH: 1, event: true },
      { durationH: 2, event: false },
      { durationH: 3, event: false },
      { durationH: 4, event: false },
    ]);
    expect(curve.censored).toBe(3);
    expect(curve.points[0].survival).toBeCloseTo(0.75, 12);
    expect(curve.medianH).toBeNull();
  });

  it('rend un échantillon vide honnêtement', () => {
    const curve = kaplanMeier([]);
    expect(curve).toEqual({ n: 0, censored: 0, points: [], medianH: null });
  });
});

describe('part censurée', () => {
  it('lit 40 % de tickets encore ouverts', () => {
    const arm: SurvivalObservation[] = [
      { durationH: 1, event: true },
      { durationH: 2, event: true },
      { durationH: 3, event: true },
      { durationH: 4, event: true },
      { durationH: 5, event: true },
      { durationH: 6, event: true },
      { durationH: 7, event: false },
      { durationH: 8, event: false },
      { durationH: 9, event: false },
      { durationH: 10, event: false },
    ];
    expect(censoredShare(arm)).toBeCloseTo(0.4, 12);
  });

  it('rend 0 pour un échantillon vide et pour des tickets tous fermés', () => {
    expect(censoredShare([])).toBe(0);
    expect(censoredShare(closedAt([1, 2, 3]))).toBe(0);
  });

  it('rend 1 pour des tickets tous ouverts', () => {
    expect(censoredShare([{ durationH: 1, event: false }])).toBe(1);
  });
});

describe('log-rank', () => {
  it('établit l’écart quand un bras est nettement plus rapide', () => {
    const result = logRank(closedAt([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      closedAt([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
    expect(Number.isFinite(result.chi2)).toBe(true);
    expect(result.established).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.chi2).toBeGreaterThan(6.635);
  });

  it('rend « pareil » pour deux bras identiques', () => {
    const result = logRank(closedAt([1, 2, 3, 4, 5]), closedAt([1, 2, 3, 4, 5]));
    expect(result.chi2).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.established).toBe(false);
  });

  it('un bras vide donne un résultat honnête, sans NaN', () => {
    const result = logRank([], closedAt([1, 2, 3]));
    expect(result.established).toBe(false);
    expect(result.reason).not.toBeNull();
    expect(Number.isFinite(result.chi2)).toBe(true);
    expect(Number.isFinite(result.pValue)).toBe(true);
    expect(result.chi2).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.nA).toBe(0);
  });

  it('sans aucun événement, le test dit qu’il n’y a rien à comparer', () => {
    const result = logRank(
      [{ durationH: 1, event: false }],
      [{ durationH: 2, event: false }],
    );
    expect(result.established).toBe(false);
    expect(result.reason).toBe('no events to compare');
  });

  it('porte la part censurée de chaque bras', () => {
    const censoredArm: SurvivalObservation[] = [
      { durationH: 1, event: true },
      { durationH: 2, event: true },
      { durationH: 3, event: false },
      { durationH: 4, event: false },
      { durationH: 5, event: false },
    ];
    const result = logRank(censoredArm, closedAt([1, 2, 3, 4, 5, 6]));
    expect(result.censoredA).toBe(3);
    expect(result.censoredShareA).toBeCloseTo(0.6, 12);
    expect(result.censoredB).toBe(0);
    expect(result.censoredShareB).toBe(0);
  });
});