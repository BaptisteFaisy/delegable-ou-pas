/**
 * Tests of `src/domain/conclusion.ts` — DP-09, SPEC §7 rules 2, 4 and 5,
 * SPEC §20, §21, recipe 6.
 */
import { describe, expect, it } from 'vitest';

import type { Balance } from '../../src/types.js';
import {
  DEFAULT_MIN_ARM_SIZE,
  medianInterval,
  proportion,
} from '../../src/domain/stats.js';
import {
  belowThreshold,
  conclude,
  concludeDurations,
  gapEstablished,
  intervalsOverlap,
  wording,
} from '../../src/domain/conclusion.js';

/** A balanced pair of arms: no composition difference at all. */
const BALANCED: Balance = { balanced: true, signals: [] };

/** Arms whose composition differs too much: concluding is forbidden. */
const UNBALANCED: Balance = {
  balanced: false,
  signals: [{ criterion: 'volume-gap', agentShare: 1, humanShare: 0.2, difference: 0.8 }],
};

/** Durations of an arm, as an interval that can be compared. */
function durations(hours: readonly number[]) {
  return medianInterval(hours);
}

describe('conclusion honnête', () => {
  it('refuse de conclure quand un bras n’a aucun ticket mesuré', () => {
    expect(conclude(proportion(18, 26), null, 20, BALANCED)).toBe('not-enough-data');
    expect(conclude(null, proportion(18, 26), 20, BALANCED)).toBe('not-enough-data');
  });

  it('refuse de conclure sous le seuil de 20 tickets par bras', () => {
    expect(conclude(proportion(17, 19), proportion(18, 26), 20, BALANCED)).toBe('not-enough-data');
    expect(belowThreshold(proportion(17, 19), DEFAULT_MIN_ARM_SIZE)).toBe(true);
    expect(belowThreshold(null, DEFAULT_MIN_ARM_SIZE)).toBe(true);
    expect(belowThreshold(proportion(18, 26), DEFAULT_MIN_ARM_SIZE)).toBe(false);
  });

  it('recette-06 : refuse de conclure sur une cohorte de 12 et 15 tickets', () => {
    const agent = proportion(10, 12);
    const human = proportion(12, 15);
    expect(conclude(agent, human, DEFAULT_MIN_ARM_SIZE, BALANCED)).toBe('not-enough-data');
  });

  it('conclut dès que les deux bras atteignent le seuil', () => {
    const agent = proportion(20, 20);
    const human = proportion(2, 20);
    expect(conclude(agent, human, 20, BALANCED)).toBe('better');
  });

  it('prend le seuil d’effectif en paramètre', () => {
    const agent = proportion(6, 6);
    const human = proportion(0, 6);
    expect(conclude(agent, human, 5, BALANCED)).toBe('better');
    expect(conclude(agent, human, 10, BALANCED)).toBe('not-enough-data');
  });

  it('refuse de conclure quand les bras sont déséquilibrés, même bien mesurés', () => {
    const agent = proportion(20, 20);
    const human = proportion(2, 20);
    expect(conclude(agent, human, 20, UNBALANCED)).toBe('not-enough-data');
  });

  it('conclut « pareil » quand les fourchettes se recouvrent', () => {
    const agent = proportion(34, 41);
    const human = proportion(32, 41);
    expect(intervalsOverlap(agent, human)).toBe(true);
    expect(conclude(agent, human, 20, BALANCED)).toBe('same');
  });

  it('considère des fourchettes qui se touchent comme recouvrantes', () => {
    const agent = { n: 40, rate: 0.9, ciLow: 0.8, ciHigh: 0.95 };
    const human = { n: 40, rate: 0.7, ciLow: 0.6, ciHigh: 0.8 };
    expect(intervalsOverlap(agent, human)).toBe(true);
    expect(conclude(agent, human, 20, BALANCED)).toBe('same');
  });

  it('conclut « mieux » quand la fourchette des agents est au-dessus', () => {
    const agent = { n: 40, rate: 0.9, ciLow: 0.8, ciHigh: 0.96 };
    const human = { n: 40, rate: 0.5, ciLow: 0.4, ciHigh: 0.6 };
    expect(conclude(agent, human, 20, BALANCED)).toBe('better');
  });

  it('conclut « pire » quand la fourchette des agents est en dessous', () => {
    const agent = { n: 40, rate: 0.3, ciLow: 0.2, ciHigh: 0.4 };
    const human = { n: 40, rate: 0.8, ciLow: 0.7, ciHigh: 0.9 };
    expect(conclude(agent, human, 20, BALANCED)).toBe('worse');
  });

  it('rend « écart établi » seulement quand les fourchettes sont disjointes', () => {
    expect(wording('better').gap).toBe('écart établi');
    expect(wording('worse').gap).toBe('écart établi');
    expect(wording('same').gap).toBe('écart non établi');
    expect(gapEstablished('not-enough-data')).toBe(false);
  });

  it('ne prétend jamais avoir prouvé, mot réservé à l’essai contrôlé', () => {
    expect(wording('better').proven).toBe(false);
    expect(wording('not-enough-data').conclusion).toBe('not-enough-data');
  });

  it('compare deux médianes avec la même règle de recouvrement', () => {
    const agent = durations(Array.from({ length: 24 }, (_, i) => 8 + (i % 3)));
    const human = durations(Array.from({ length: 24 }, (_, i) => 8 + (i % 3)));
    expect(concludeDurations(agent, human, 20, BALANCED, 'lower-is-better')).toBe('same');
  });

  it('conclut sur des durées dans le sens du critère demandé', () => {
    const agent = durations(Array.from({ length: 24 }, (_, i) => 4 + (i % 2)));
    const human = durations(Array.from({ length: 24 }, (_, i) => 40 + (i % 2)));
    expect(concludeDurations(agent, human, 20, BALANCED, 'lower-is-better')).toBe('better');
    expect(concludeDurations(agent, human, 20, BALANCED, 'higher-is-better')).toBe('worse');
  });

  it('refuse de conclure sur des durées sous le seuil ou sur des bras déséquilibrés', () => {
    const agent = durations([4, 5, 6]);
    const human = durations([40, 50, 60]);
    expect(concludeDurations(agent, human, 20, BALANCED, 'lower-is-better')).toBe('not-enough-data');
    const big = durations(Array.from({ length: 24 }, (_, i) => 4 + (i % 2)));
    expect(concludeDurations(big, big, 20, UNBALANCED, 'lower-is-better')).toBe('not-enough-data');
    expect(concludeDurations(null, big, 20, BALANCED, 'lower-is-better')).toBe('not-enough-data');
  });
});
