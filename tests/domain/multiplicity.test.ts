/**
 * Tests of `src/domain/multiplicity.ts` — DP-14, SPEC §7 rule 3 and rule 7.
 *
 * The imposed figures: 35 cells tested at alpha = 0.05 expect 1.75 false
 * positives, and the reference game keeps exactly 6 cells alive.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FDR_ALPHA,
  benjaminiHochberg,
  bonferroni,
  expectedFalsePositives,
  multiplicityNote,
} from '../../src/domain/multiplicity.js';
import type { AdjustedCell, TestedCell } from '../../src/domain/multiplicity.js';

/**
 * The reference game: 35 cells whose six smallest p-values are built so that
 * rank 6 sits just under the BH threshold (35/6 * 0.008 ≈ 0.0467 ≤ 0.05) and
 * rank 7 just above it (every later p is (j + 1) / 700 > j / 700 = j·α/m).
 * Exactly 6 cells survive; Bonferroni on the same game keeps only 1.
 */
function thirtyFiveCells(): TestedCell[] {
  const cells: TestedCell[] = [];
  const smallest = [0.001, 0.002, 0.003, 0.004, 0.005, 0.008];
  smallest.forEach((pValue, index) => {
    cells.push({ key: `cell-${index + 1}`, pValue });
  });
  for (let j = 7; j <= 35; j += 1) {
    cells.push({ key: `cell-${j}`, pValue: (j + 1) / 700 });
  }
  return cells;
}

/** Asserts the q-values never decrease as the rank grows. */
function expectMonotone(adjusted: readonly AdjustedCell[]): void {
  for (let i = 1; i < adjusted.length; i += 1) {
    expect(adjusted[i].qValue).toBeGreaterThanOrEqual(adjusted[i - 1].qValue);
  }
}

describe('benjaminiHochberg', () => {
  it('renders monotone q-values on the 35-cell game', () => {
    const adjusted = benjaminiHochberg(thirtyFiveCells());
    expect(adjusted).toHaveLength(35);
    expectMonotone(adjusted);
  });

  it('sweeps backwards so the classic trap stays monotone', () => {
    // Naive formula q_i = m/i * p_i on [0.001, 0.5, 0.7] gives
    // [0.003, 0.75, 0.7]: NOT monotone, the correction would be wrong.
    const cells: TestedCell[] = [
      { key: 'a', pValue: 0.001 },
      { key: 'b', pValue: 0.5 },
      { key: 'c', pValue: 0.7 },
    ];
    const naive = cells.map((cell, index) => (3 * cell.pValue) / (index + 1));
    expect(naive[1]).toBeGreaterThan(naive[2]); // the trap, written black on white
    const adjusted = benjaminiHochberg(cells);
    expectMonotone(adjusted);
    expect(adjusted[0].qValue).toBeCloseTo(0.003, 10);
    expect(adjusted[1].qValue).toBeCloseTo(0.7, 10);
    expect(adjusted[2].qValue).toBeCloseTo(0.7, 10);
  });

  it('adjusts a single cell to its own p-value', () => {
    const adjusted = benjaminiHochberg([{ key: 'only', pValue: 0.03 }]);
    expect(adjusted).toEqual([
      { key: 'only', pValue: 0.03, rank: 1, qValue: 0.03, significant: true },
    ]);
  });

  it('renders an empty list when no cell is tested (m = 0)', () => {
    expect(benjaminiHochberg([])).toEqual([]);
  });

  it('gives tied p-values the same q-value and breaks ties by key', () => {
    const adjusted = benjaminiHochberg([
      { key: 'zeta', pValue: 0.01 },
      { key: 'alpha', pValue: 0.01 },
    ]);
    expect(adjusted.map((cell) => cell.key)).toEqual(['alpha', 'zeta']);
    expect(adjusted[0].rank).toBe(1);
    expect(adjusted[1].rank).toBe(2);
    expect(adjusted[0].qValue).toBe(adjusted[1].qValue);
    expectMonotone(adjusted);
  });

  it('handles p = 0 and p = 1 at the bounds', () => {
    const adjusted = benjaminiHochberg([
      { key: 'zero', pValue: 0 },
      { key: 'one-a', pValue: 1 },
      { key: 'one-b', pValue: 1 },
    ]);
    expect(adjusted[0].qValue).toBe(0);
    expect(adjusted[0].significant).toBe(true);
    expect(adjusted[1].qValue).toBe(1);
    expect(adjusted[2].qValue).toBe(1);
    expect(adjusted[1].significant).toBe(false);
  });

  it('bounds every q-value to 1', () => {
    const adjusted = benjaminiHochberg([
      { key: 'a', pValue: 0.9 },
      { key: 'b', pValue: 0.95 },
    ]);
    for (const cell of adjusted) {
      expect(cell.qValue).toBeLessThanOrEqual(1);
    }
  });

  it('keeps exactly 6 of the 35 cells alive at alpha = 0.05', () => {
    const adjusted = benjaminiHochberg(thirtyFiveCells());
    const surviving = adjusted.filter((cell) => cell.significant);
    expect(surviving).toHaveLength(6);
    expect(surviving.map((cell) => cell.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(surviving[5].qValue).toBeCloseTo((35 * 0.008) / 6, 10);
    expect(adjusted[6].significant).toBe(false);
  });

  it('hides nothing: every tested cell comes back (SPEC §7 rule 7)', () => {
    const cells = thirtyFiveCells();
    const adjusted = benjaminiHochberg(cells);
    const keys = adjusted.map((cell) => cell.key).sort();
    expect(keys).toEqual(cells.map((cell) => cell.key).sort());
  });

  it('is deterministic: same input twice and shuffled give the same order', () => {
    const cells = thirtyFiveCells();
    const first = benjaminiHochberg(cells);
    const second = benjaminiHochberg(cells);
    expect(second).toEqual(first);
    const shuffled = [...cells].reverse();
    expect(benjaminiHochberg(shuffled)).toEqual(first);
  });
});

describe('bonferroni', () => {
  it('multiplies by the number of tests and bounds to 1', () => {
    expect(bonferroni(0.01, 35)).toBeCloseTo(0.35, 10);
    expect(bonferroni(0.5, 35)).toBe(1);
    expect(bonferroni(0.03, 1)).toBeCloseTo(0.03, 10);
  });

  it('is more conservative than Benjamini-Hochberg on the same game', () => {
    const cells = thirtyFiveCells();
    const bhSurvivors = benjaminiHochberg(cells).filter((c) => c.significant).length;
    const bonfSurvivors = cells.filter(
      (cell) => bonferroni(cell.pValue, cells.length) <= DEFAULT_FDR_ALPHA,
    ).length;
    expect(bhSurvivors).toBe(6);
    expect(bonfSurvivors).toBeLessThan(bhSurvivors);
    expect(bonfSurvivors).toBe(1);
  });
});

describe('expectedFalsePositives', () => {
  it('renders the imposed figure: 35 cells at alpha = 0.05 expect 1.75', () => {
    expect(expectedFalsePositives(35)).toBeCloseTo(1.75, 10);
  });

  it('follows alpha and never goes negative', () => {
    expect(expectedFalsePositives(35, 0.01)).toBeCloseTo(0.35, 10);
    expect(expectedFalsePositives(0)).toBe(0);
  });
});

describe('multiplicityNote', () => {
  it('decomposes the total for the card screen (SPEC §7 rule 7)', () => {
    const cells = thirtyFiveCells();
    const adjusted = benjaminiHochberg(cells);
    expect(multiplicityNote(cells, adjusted)).toEqual({
      tested: 35,
      surviving: 6,
      expectedFalse: 1.75,
      method: 'benjamini-hochberg',
    });
  });

  it('says so when nothing was tested or nothing survives', () => {
    expect(multiplicityNote([], [])).toEqual({
      tested: 0,
      surviving: 0,
      expectedFalse: 0,
      method: 'benjamini-hochberg',
    });
    const doomed: TestedCell[] = [{ key: 'a', pValue: 0.5 }];
    const note = multiplicityNote(doomed, benjaminiHochberg(doomed));
    expect(note.tested).toBe(1);
    expect(note.surviving).toBe(0);
  });
});
