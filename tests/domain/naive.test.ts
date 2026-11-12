/**
 * Tests of `src/domain/naive.ts` — the naive aggregate and its honest
 * breakdown: SPEC §7 rule 7 (no global figure without its breakdown),
 * SPEC §21 ("total favorable, cohorts défavorables"), SPEC §20, DP-08,
 * DP-09, DP-10, DP-17.
 */
import { describe, expect, it } from 'vitest';

import type { Balance } from '../../src/types.js';
import { DEFAULT_MIN_ARM_SIZE, proportion } from '../../src/domain/stats.js';
import { conclude } from '../../src/domain/conclusion.js';
import {
  NAIVE_LABEL,
  honestBreakdown,
  naiveAggregate,
  selectionBiasEvidence,
  simpsonFlag,
  type CohortCell,
} from '../../src/domain/naive.js';

/** A balanced pair of arms: the composition is not what these tests study. */
const BALANCED: Balance = { balanced: true, signals: [] };

/**
 * One cell of the breakdown, its verdict computed by the arbitration used
 * everywhere else (SPEC §7 rule 4) — the tests do not hardcode the verdicts.
 */
function cell(
  key: string,
  agentClean: number,
  agentTotal: number,
  humanClean: number,
  humanTotal: number,
): CohortCell {
  const agent = proportion(agentClean, agentTotal);
  const human = proportion(humanClean, humanTotal);
  return { key, agent, human, conclusion: conclude(agent, human, DEFAULT_MIN_ARM_SIZE, BALANCED) };
}

/**
 * Simpson's paradox, built by hand: the agent arm received the easy tickets
 * (900 of its 1000 tickets in the small cohort), so the total favours the
 * agents (74 % against 54,5 %) while every single cohort favours the humans.
 */
const SIMPSON_CELLS: readonly CohortCell[] = [
  cell('bugfix×api×S', 720, 900, 95, 100),
  cell('bugfix×api×L', 20, 100, 450, 900),
];
const SIMPSON_NAIVE = naiveAggregate(740, 1000, 545, 1000);

describe('chiffre naïf contre décomposition honnête', () => {
  it('détecte le paradoxe de Simpson : le total favorable aux agents, toutes les cohortes défavorables', () => {
    expect(SIMPSON_NAIVE.conclusion).toBe('better');
    expect(SIMPSON_CELLS.map((one) => one.conclusion)).toEqual(['worse', 'worse']);

    const breakdown = honestBreakdown(SIMPSON_NAIVE, SIMPSON_CELLS);
    expect(breakdown.contradicts).toBe(true);
    expect(breakdown.explanation).toContain('2 of 2');
    expect(breakdown.explanation).toContain('2 cohortes décisives sur 2');
    expect(breakdown.explanation).toContain('les agents font mieux');
    expect(simpsonFlag(SIMPSON_NAIVE, SIMPSON_CELLS).paradox).toBe(true);
  });

  it('prouve le biais de sélection : 70 % de petits tickets côté agent contre 30 % côté humain', () => {
    const evidence = selectionBiasEvidence(SIMPSON_CELLS, () => ({ agent: 0.7, human: 0.3 }));
    expect(evidence.biased).toBe(true);
    expect(evidence.detail).toContain('70 %');
    expect(evidence.detail).toContain('30 %');
    expect(evidence.detail).toContain('40 points');
    expect(evidence.detail).toContain('2 of 2 cohort(s) above tolerance');
  });

  it('étiquette toujours le chiffre naïf : le type lui-même porte l\'étiquette', () => {
    const naive = naiveAggregate(740, 1000, 545, 1000);
    expect(naive.labelled).toBe(NAIVE_LABEL);
    expect(naive.labelled).toContain('naive');
    expect(naive.labelled).toContain('chiffre naïf');
  });

  it('porte les effectifs, les fourchettes et l\'écart établi de chaque bras', () => {
    expect(SIMPSON_NAIVE.agent.n).toBe(1000);
    expect(SIMPSON_NAIVE.human.n).toBe(1000);
    expect(SIMPSON_NAIVE.agent.ciLow).toBeLessThan(SIMPSON_NAIVE.agent.rate);
    expect(SIMPSON_NAIVE.agent.ciHigh).toBeGreaterThan(SIMPSON_NAIVE.agent.rate);
    expect(SIMPSON_NAIVE.difference.diff).toBeCloseTo(0.195, 3);
    expect(SIMPSON_NAIVE.difference.established).toBe(true);
  });

  it('refuse de conclure sous le seuil de 20 tickets par bras', () => {
    expect(naiveAggregate(9, 10, 9, 10).conclusion).toBe('not-enough-data');
  });

  it('refuse de conclure quand les deux bras n\'ont pas le même volume', () => {
    // 400 tickets against 100: a volume gap of 75 %, far past the 20 % tolerance.
    expect(naiveAggregate(300, 400, 50, 100).conclusion).toBe('not-enough-data');
  });

  it('ne retire aucune cohorte : la décomposition ajoute, elle ne cache rien', () => {
    const breakdown = honestBreakdown(SIMPSON_NAIVE, SIMPSON_CELLS);
    expect(breakdown.cells).toHaveLength(SIMPSON_CELLS.length);
    expect(breakdown.naive).toBe(SIMPSON_NAIVE);
    expect(breakdown.naive.labelled).toBe(NAIVE_LABEL);
  });

  it('n\'accuse aucun paradoxe quand les cohortes vont dans le sens du total', () => {
    const naive = naiveAggregate(880, 1000, 350, 1000);
    const cells = [cell('bugfix×api×S', 800, 900, 50, 100), cell('bugfix×api×L', 80, 100, 300, 900)];
    expect(naive.conclusion).toBe('better');
    expect(cells.map((one) => one.conclusion)).toEqual(['better', 'better']);

    const breakdown = honestBreakdown(naive, cells);
    expect(breakdown.contradicts).toBe(false);
    expect(breakdown.explanation).toContain('0 of 2');
    expect(simpsonFlag(naive, cells).paradox).toBe(false);
  });

  it('ne compte pas les cohortes grises comme des contradictions', () => {
    const cells = [cell('bugfix×api×S', 720, 900, 95, 100), cell('bugfix×api×M', 5, 8, 1, 9)];
    expect(cells[1].conclusion).toBe('not-enough-data');

    const breakdown = honestBreakdown(SIMPSON_NAIVE, cells);
    expect(breakdown.contradicts).toBe(true);
    expect(breakdown.explanation).toContain('1 of 1');
    expect(breakdown.explanation).toContain('grey: 1');
  });

  it('ne peut accuser aucun paradoxe quand le total n\'établit aucune direction', () => {
    const naive = naiveAggregate(500, 1000, 500, 1000);
    expect(naive.conclusion).toBe('same');

    const breakdown = honestBreakdown(naive, SIMPSON_CELLS);
    expect(breakdown.contradicts).toBe(false);
    expect(breakdown.explanation).toContain('establishes no direction');
    expect(breakdown.explanation).toContain('n\'établit aucune direction');
  });

  it('ne trouve aucun biais quand les deux bras ont la même part de tickets faciles', () => {
    const evidence = selectionBiasEvidence(SIMPSON_CELLS, () => ({ agent: 0.5, human: 0.5 }));
    expect(evidence.biased).toBe(false);
    expect(evidence.detail).toContain('50 %');
    expect(evidence.detail).toContain('0 of 2 cohort(s) above tolerance');
  });

  it('prouve le biais dès qu\'une cohorte dépasse la tolérance, même si la répartition globale semble neutre', () => {
    const cells = [cell('bugfix×api×S', 720, 900, 95, 100), cell('bugfix×api×S-bis', 5, 8, 1, 9)];
    const evidence = selectionBiasEvidence(cells, (key) =>
      key === 'bugfix×api×S-bis' ? { agent: 0.7, human: 0.3 } : { agent: 0.5, human: 0.5 },
    );
    expect(evidence.biased).toBe(true);
    expect(evidence.detail).toContain('1 of 2 cohort(s) above tolerance');
  });

  it('ne prouve rien sans cohorte', () => {
    const evidence = selectionBiasEvidence([], () => ({ agent: 0.7, human: 0.3 }));
    expect(evidence.biased).toBe(false);
    expect(evidence.detail).toContain('0 of 0');
  });
});
