/**
 * Tests of `src/domain/difference.ts` — Newcombe method 10 on the difference
 * and the TOST equivalence test.
 * SPEC §7 rule 4 (corrected arbiter), METHODE.md « L'écart se teste sur la
 * différence », DP-09.
 */
import { describe, expect, it } from 'vitest';

import { proportion } from '../../src/domain/stats.js';
import {
  DEFAULT_EQUIVALENCE_MARGIN,
  newcombeDifference,
  tostEquivalence,
} from '../../src/domain/difference.js';

describe('Newcombe — la différence décide, pas le recouvrement', () => {
  it('établit un écart que deux fourchettes qui se recouvrent cachaient (60/100 vs 45/100)', () => {
    const a = proportion(60, 100);
    const b = proportion(45, 100);
    // Wilson: [0,502 ; 0,691] et [0,356 ; 0,548] — overlapping.
    const stat = newcombeDifference(a, b);
    expect(stat.diff).toBeCloseTo(0.15, 3);
    // Newcombe on the difference ≈ [0,012 ; 0,280] — it excludes 0.
    expect(stat.ciLow).toBeCloseTo(0.012, 2);
    expect(stat.ciHigh).toBeCloseTo(0.28, 2);
    expect(stat.established).toBe(true);
  });

  it('n\'établit pas d\'écart quand la différence contient 0 (34/41 vs 32/37)', () => {
    const a = proportion(34, 41);
    const b = proportion(32, 37);
    const stat = newcombeDifference(a, b);
    expect(stat.diff).toBeCloseTo(-0.036, 3);
    expect(stat.ciLow).toBeLessThan(0);
    expect(stat.ciHigh).toBeGreaterThan(0);
    expect(stat.established).toBe(false);
  });

  it('porte l\'effectif et le taux de chaque bras', () => {
    const stat = newcombeDifference(proportion(60, 100), proportion(45, 100));
    expect(stat.nA).toBe(100);
    expect(stat.nB).toBe(100);
    expect(stat.rateA).toBeCloseTo(0.6, 6);
    expect(stat.rateB).toBeCloseTo(0.45, 6);
  });
});

describe('TOST — l\'équivalence se juge sur l\'intervalle de la différence', () => {
  it('ne conclut pas l\'équivalence pour 60/100 vs 45/100 à la marge par défaut', () => {
    const r = tostEquivalence(proportion(60, 100), proportion(45, 100));
    expect(r.equivalent).toBe(false);
    expect(r.margin).toBe(DEFAULT_EQUIVALENCE_MARGIN);
  });

  it('ne conclut pas « pareil » pour 34/41 vs 32/37 (honnête : pas assez de recul)', () => {
    const r = tostEquivalence(proportion(34, 41), proportion(32, 37));
    expect(r.equivalent).toBe(false);
  });

  it('conclut l\'équivalence quand l\'intervalle tient dans la marge', () => {
    const r = tostEquivalence(proportion(5000, 10000), proportion(4950, 10000));
    expect(r.diff).toBeCloseTo(0.005, 3);
    expect(r.equivalent).toBe(true);
    expect(r.ciLow).toBeGreaterThanOrEqual(-DEFAULT_EQUIVALENCE_MARGIN);
    expect(r.ciHigh).toBeLessThanOrEqual(DEFAULT_EQUIVALENCE_MARGIN);
  });

  it('accepte une marge d\'équivalence personnalisée', () => {
    const r = tostEquivalence(proportion(34, 41), proportion(32, 37), 0.30);
    expect(r.equivalent).toBe(true);
    expect(r.margin).toBe(0.3);
  });
});