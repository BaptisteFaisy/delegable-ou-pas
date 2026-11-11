/**
 * Tests of the calibration (SPEC §10 "La calibration"; DP-21).
 */
import { describe, expect, it } from 'vitest';
import { adviceAddsNothing, calibrate, confidenceGap } from '../../src/domain/calibration.js';

describe('calibrate', () => {
  it('rend une proportion avec effectif et fourchette, jamais un taux nu', () => {
    const row = calibrate('p', 'e', 'delegate', 80, 100);
    expect(row.value).toBe('delegate');
    expect(row.clean.n).toBe(100);
    expect(row.clean.rate).toBeCloseTo(0.8, 5);
    expect(row.clean.ciLow).toBeLessThan(row.clean.rate);
    expect(row.clean.ciHigh).toBeGreaterThan(row.clean.rate);
  });

  it('un effectif nul reste une proportion honnête', () => {
    const row = calibrate('p', 'e', 'keep-human', 0, 0);
    expect(row.clean).toEqual({ n: 0, rate: 0, ciLow: 0, ciHigh: 1 });
  });
});

describe('adviceAddsNothing', () => {
  it('true quand les fourchettes se recouvrent', () => {
    const delegate = calibrate('p', 'e', 'delegate', 80, 100);
    const keep = calibrate('p', 'e', 'keep-human', 75, 100);
    expect(adviceAddsNothing([delegate, keep])).toBe(true);
  });

  it('false quand « à confier » bat nettement « à garder »', () => {
    const delegate = calibrate('p', 'e', 'delegate', 90, 100);
    const keep = calibrate('p', 'e', 'keep-human', 40, 100);
    expect(adviceAddsNothing([delegate, keep])).toBe(false);
  });

  it('true quand un des deux côtés n’a aucune donnée', () => {
    const delegate = calibrate('p', 'e', 'delegate', 80, 100);
    expect(adviceAddsNothing([delegate])).toBe(true);
    expect(adviceAddsNothing([])).toBe(true);
  });
});

describe('confidenceGap', () => {
  it('mesure l’avance de « à confier » sur « à garder »', () => {
    const delegate = calibrate('p', 'e', 'delegate', 90, 100);
    const keep = calibrate('p', 'e', 'keep-human', 40, 100);
    expect(confidenceGap(delegate.clean, keep.clean)).toBeCloseTo(0.5, 5);
  });
});