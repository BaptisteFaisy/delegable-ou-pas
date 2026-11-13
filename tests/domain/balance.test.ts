/**
 * Tests of `src/domain/balance.ts` — DP-10, SPEC §7 rule 5, SPEC §21, recipe 7.
 */
import { describe, expect, it } from 'vitest';

import type { BalanceCriterion, BalanceSignal } from '../../src/types.js';
import {
  DEFAULT_BALANCE_TOLERANCE,
  compareBalance,
  compareBalanceDetailed,
  composition,
} from '../../src/domain/balance.js';
import { conclude } from '../../src/domain/conclusion.js';
import { proportion } from '../../src/domain/stats.js';

/** Differences measured for one criterion, in category order. */
function differencesOf(
  signals: readonly BalanceSignal[],
  criterion: BalanceCriterion,
): readonly number[] {
  return signals.filter((signal) => signal.criterion === criterion).map((signal) => signal.difference);
}

describe('équilibre des bras', () => {
  it('emploie une tolérance de 20 % par défaut', () => {
    expect(DEFAULT_BALANCE_TOLERANCE).toBe(0.2);
  });

  it('conserve l’effectif et la composition d’un bras', () => {
    const arm = composition(30, { S: 20, M: 10 }, { bugfix: 30 });
    expect(arm.total).toBe(30);
    expect(arm.sizes).toEqual({ S: 20, M: 10 });
    expect(arm.natures).toEqual({ bugfix: 30 });
  });

  it('considère deux bras de même composition comme équilibrés', () => {
    const agent = composition(30, { S: 20, M: 10 }, { bugfix: 20, refactor: 10 });
    const human = composition(30, { S: 20, M: 10 }, { bugfix: 20, refactor: 10 });
    const balance = compareBalance(agent, human, DEFAULT_BALANCE_TOLERANCE);
    expect(balance.balanced).toBe(true);
    expect(balance.signals.every((signal) => signal.difference === 0)).toBe(true);
  });

  it('compare les deux bras sur les trois critères du contrat', () => {
    const agent = composition(30, { S: 30 }, { bugfix: 30 });
    const human = composition(30, { S: 30 }, { bugfix: 30 });
    const criteria = compareBalance(agent, human, DEFAULT_BALANCE_TOLERANCE).signals.map(
      (signal) => signal.criterion,
    );
    expect([...new Set(criteria)].sort()).toEqual(['nature-mix', 'size-mix', 'volume-gap']);
  });

  it('recette-07 : signale des bras déséquilibrés et interdit de conclure', () => {
    const agent = composition(30, { S: 27, M: 3 }, { bugfix: 30 });
    const human = composition(30, { S: 6, M: 24 }, { bugfix: 30 });
    const balance = compareBalance(agent, human, DEFAULT_BALANCE_TOLERANCE);
    expect(balance.balanced).toBe(false);
    expect(conclude(proportion(25, 30), proportion(20, 30), 20, balance)).toBe('not-enough-data');
  });

  it('détecte un écart de volume, la cohorte où tout part aux agents', () => {
    const agent = composition(40, { S: 40 }, { bugfix: 40 });
    const human = composition(10, { S: 10 }, { bugfix: 10 });
    const report = compareBalanceDetailed(agent, human, DEFAULT_BALANCE_TOLERANCE);
    expect(report.triggered).toEqual(['volume-gap']);
    expect(differencesOf(report.balance.signals, 'volume-gap')).toEqual([0.75]);
  });

  it('signale un bras humain vidé de ses tickets', () => {
    const agent = composition(30, { S: 30 }, { bugfix: 30 });
    const human = composition(0, {}, {});
    const report = compareBalanceDetailed(agent, human, DEFAULT_BALANCE_TOLERANCE);
    expect(report.balance.balanced).toBe(false);
    expect(report.triggered).toEqual(['volume-gap']);
    expect(differencesOf(report.balance.signals, 'size-mix')).toEqual([]);
  });

  it('détecte un écart de nature entre les deux bras', () => {
    const agent = composition(30, { S: 30 }, { refactor: 30 });
    const human = composition(30, { S: 30 }, { bugfix: 30 });
    const report = compareBalanceDetailed(agent, human, DEFAULT_BALANCE_TOLERANCE);
    expect(report.triggered).toEqual(['nature-mix']);
    expect(differencesOf(report.balance.signals, 'nature-mix')).toEqual([1, 1]);
  });

  it('liste les critères qui ont déclenché l’alerte pour l’affichage', () => {
    const agent = composition(40, { S: 40 }, { refactor: 40 });
    const human = composition(10, { M: 10 }, { bugfix: 10 });
    const report = compareBalanceDetailed(agent, human, DEFAULT_BALANCE_TOLERANCE);
    expect(report.triggered).toEqual(['size-mix', 'nature-mix', 'volume-gap']);
  });

  it('tolère un écart qui reste sous la tolérance demandée', () => {
    const agent = composition(30, { S: 24, M: 6 }, { bugfix: 30 });
    const human = composition(30, { S: 15, M: 15 }, { bugfix: 30 });
    expect(compareBalance(agent, human, 0.2).balanced).toBe(false);
    expect(compareBalance(agent, human, 0.5).balanced).toBe(true);
  });

  it('rend les parts de chaque bras avec chaque écart', () => {
    const agent = composition(20, { S: 20 }, { bugfix: 20 });
    const human = composition(20, { S: 10, M: 10 }, { bugfix: 20 });
    const sizes = compareBalance(agent, human, 0.2).signals.filter(
      (signal) => signal.criterion === 'size-mix',
    );
    expect(sizes).toEqual([
      { criterion: 'size-mix', agentShare: 0, humanShare: 0.5, difference: 0.5 },
      { criterion: 'size-mix', agentShare: 1, humanShare: 0.5, difference: 0.5 },
    ]);
  });
});
