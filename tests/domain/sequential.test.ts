/**
 * Tests of the sequential boundaries of the controlled trial
 * (SPEC §11 "L'essai contrôlé", DP-27).
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_ALPHA, normalUpperTail } from '../../src/domain/power.js';
import {
  DEFAULT_SAFETY_REOPENING_THRESHOLD,
  evaluateLook,
  obrienFlemingBoundaries,
  safetyStop,
} from '../../src/domain/sequential.js';
import type { SequentialBoundary } from '../../src/domain/sequential.js';

/** The five looks of the demonstration. */
const LOOKS = 5;

/** The statistic that would fool an uncorrected daily look. */
const TRAP_Z = 1.8;

/** Boundaries of the demonstration. */
const BOUNDARIES: readonly SequentialBoundary[] = obrienFlemingBoundaries(LOOKS);

/** Sum of the alpha spent by the boundaries. */
function totalAlphaSpent(boundaries: readonly SequentialBoundary[]): number {
  return boundaries.reduce((total, boundary) => total + boundary.alphaSpent, 0);
}

describe('obrienFlemingBoundaries — the alpha is spent once', () => {
  it('spends five looks without exceeding alpha', () => {
    expect(BOUNDARIES).toHaveLength(LOOKS);
    expect(totalAlphaSpent(BOUNDARIES)).toBeLessThanOrEqual(DEFAULT_ALPHA + 1e-12);
    expect(totalAlphaSpent(BOUNDARIES)).toBeGreaterThan(DEFAULT_ALPHA * 0.99);
  });

  it('starts very high and falls back on 1.96', () => {
    expect(BOUNDARIES[0].zBoundary).toBeGreaterThan(4);
    expect(BOUNDARIES[LOOKS - 1].zBoundary).toBeCloseTo(1.959964, 4);
    for (let index = 1; index < LOOKS; index += 1) {
      expect(BOUNDARIES[index].zBoundary).toBeLessThan(BOUNDARIES[index - 1].zBoundary);
    }
  });

  it('walks the information fraction from 1/5 to 1', () => {
    expect(BOUNDARIES.map((boundary) => boundary.informationFraction)).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
    expect(BOUNDARIES.map((boundary) => boundary.look)).toEqual([1, 2, 3, 4, 5]);
  });

  it('spends a growing share of the alpha at each look', () => {
    for (let index = 1; index < LOOKS; index += 1) {
      expect(BOUNDARIES[index].alphaSpent).toBeGreaterThan(BOUNDARIES[index - 1].alphaSpent);
    }
    expect(BOUNDARIES[0].alphaSpent).toBeLessThan(1e-4);
  });

  it('falls back on the fixed sample test with a single look', () => {
    const single = obrienFlemingBoundaries(1);
    expect(single).toHaveLength(1);
    expect(single[0].zBoundary).toBeCloseTo(1.959964, 4);
    expect(single[0].alphaSpent).toBeCloseTo(DEFAULT_ALPHA, 6);
    expect(single[0].informationFraction).toBe(1);
  });

  it('answers an empty plan for an impossible number of looks', () => {
    expect(obrienFlemingBoundaries(0)).toEqual([]);
    expect(obrienFlemingBoundaries(-3)).toEqual([]);
  });

  it('keeps the budget of a stricter alpha', () => {
    expect(totalAlphaSpent(obrienFlemingBoundaries(10, 0.01))).toBeLessThanOrEqual(0.01 + 1e-12);
  });
});

describe('evaluateLook — the trap of looking every day', () => {
  it('concludes nothing at five looks of z = 1.8', () => {
    const history: number[] = [];
    for (let look = 1; look <= LOOKS; look += 1) {
      const decision = evaluateLook({
        looks: [...history],
        zObserved: TRAP_Z,
        informationFraction: look / LOOKS,
        boundaries: BOUNDARIES,
      });
      expect(decision.stop).toBe('continue');
      expect(decision.zObserved).toBe(TRAP_Z);
      expect(decision.boundary).toBe(BOUNDARIES[look - 1].zBoundary);
      expect(decision.alphaSpentTotal).toBeLessThanOrEqual(DEFAULT_ALPHA + 1e-12);
      history.push(TRAP_Z);
    }
  });

  it('shows why: each uncorrected look would have rejected', () => {
    const naiveP = normalUpperTail(TRAP_Z);
    expect(naiveP).toBeLessThan(DEFAULT_ALPHA);
    const familyWise = 1 - Math.pow(1 - naiveP, LOOKS);
    expect(familyWise).toBeGreaterThan(0.15);
    expect(familyWise).toBeGreaterThan(DEFAULT_ALPHA * 3);
  });

  it('concludes efficacy only beyond the boundary of the current look', () => {
    const last = evaluateLook({
      looks: [1.8, 1.8, 1.8, 1.8],
      zObserved: 2.5,
      informationFraction: 1,
      boundaries: BOUNDARIES,
    });
    expect(last.stop).toBe('efficacy');
    expect(last.boundary).toBeCloseTo(1.959964, 4);
    expect(last.alphaSpentTotal).toBeCloseTo(DEFAULT_ALPHA, 6);

    const first = evaluateLook({
      looks: [],
      zObserved: 3,
      informationFraction: 1 / LOOKS,
      boundaries: BOUNDARIES,
    });
    expect(first.stop).toBe('continue');

    const firstHigh = evaluateLook({
      looks: [],
      zObserved: 4.5,
      informationFraction: 1 / LOOKS,
      boundaries: BOUNDARIES,
    });
    expect(firstHigh.stop).toBe('efficacy');
  });

  it('gives priority to the safety rule (SPEC §11 step 4)', () => {
    const decision = evaluateLook({
      looks: [1.8],
      zObserved: 5,
      informationFraction: 0.4,
      boundaries: BOUNDARIES,
      reopeningsAgent: DEFAULT_SAFETY_REOPENING_THRESHOLD,
      reopeningsHuman: 0,
    });
    expect(decision.stop).toBe('safety');
    expect(decision.reason).toContain('réouvertures');
  });

  it('stops for futility when the effect runs the other way', () => {
    const decision = evaluateLook({
      looks: [0.5, 0.2],
      zObserved: -3,
      informationFraction: 0.6,
      boundaries: BOUNDARIES,
    });
    expect(decision.stop).toBe('futility');
  });

  it('stops for futility when significance is out of reach', () => {
    const decision = evaluateLook({
      looks: [],
      zObserved: -3,
      informationFraction: 0.2,
      boundaries: BOUNDARIES,
    });
    expect(decision.stop).toBe('futility');
    expect(decision.reason).toContain('puissance conditionnelle');
  });

  it('never concludes without boundaries: the budget is unknown', () => {
    const decision = evaluateLook({
      looks: [],
      zObserved: 9,
      informationFraction: 1,
      boundaries: [],
    });
    expect(decision.stop).toBe('continue');
    expect(decision.boundary).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('safetyStop — the arm that piles up reopenings', () => {
  it('stops when the agent arm reaches the threshold', () => {
    expect(safetyStop(0, 0)).toBe(false);
    expect(safetyStop(2, 0)).toBe(false);
    expect(safetyStop(DEFAULT_SAFETY_REOPENING_THRESHOLD, 0)).toBe(true);
    expect(safetyStop(7, 2)).toBe(true);
  });

  it('honours a tuneable threshold', () => {
    expect(safetyStop(4, 0, 5)).toBe(false);
    expect(safetyStop(5, 0, 5)).toBe(true);
    expect(safetyStop(3, 3, 3)).toBe(true);
  });

  it('compares the arms when the threshold is zero', () => {
    expect(safetyStop(0, 0, 0)).toBe(false);
    expect(safetyStop(1, 0, 0)).toBe(true);
    expect(safetyStop(2, 5, 0)).toBe(false);
  });

  it('reads a missing count as nothing measured', () => {
    expect(safetyStop(Number.NaN, Number.NaN)).toBe(false);
    expect(safetyStop(-4, 0)).toBe(false);
  });
});
