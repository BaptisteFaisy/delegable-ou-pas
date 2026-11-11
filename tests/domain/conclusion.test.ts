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

  it('ne dit plus « pareil » sur le seul recouvrement : la différence décide (34/41 vs 32/41)', () => {
    const agent = proportion(34, 41);
    const human = proportion(32, 41);
    // The raw intervals still overlap (corrected arbiter: see difference.ts).
    expect(intervalsOverlap(agent, human)).toBe(true);
    // The difference interval (≈ [-0,125 ; 0,219]) contains 0 and is wider than
    // the 10-point equivalence margin: neither a gap nor equivalence → honest
    // "we do not know", where the old rule wrongly said "same".
    expect(conclude(agent, human, 20, BALANCED)).toBe('not-enough-data');
  });

  it('ne dit plus « pareil » sur des fourchettes qui se touchent : la différence exclut 0', () => {
    const agent = { n: 40, rate: 0.9, ciLow: 0.8, ciHigh: 0.95 };
    const human = { n: 40, rate: 0.7, ciLow: 0.6, ciHigh: 0.8 };
    expect(intervalsOverlap(agent, human)).toBe(true);
    // Touching bounds used to count as "same". The difference interval here
    // excludes 0 (≈ [0,059 ; 0,341]), so the gap is established after all.
    expect(conclude(agent, human, 20, BALANCED)).toBe('better');
  });

  it('établit l\'écart que l\'ancien recouvrement appelait « pareil » (60/100 vs 45/100)', () => {
    const agent = proportion(60, 100);
    const human = proportion(45, 100);
    // Wilson: [0,502 ; 0,691] et [0,356 ; 0,548] — they overlap, and the merged
    // rule concluded "same". Newcombe on the difference ≈ [0,012 ; 0,280]:
    // it excludes 0, so the gap is established. This is the proof of the fix.
    expect(intervalsOverlap(agent, human)).toBe(true);
    expect(conclude(agent, human, 20, BALANCED)).toBe('better');
  });

  it('répond honnêtement « on ne sait pas » pour 34/41 vs 32/37 (SPEC §7 règle 3)', () => {
    const agent = proportion(34, 41);
    const human = proportion(32, 37);
    // Difference ≈ -0,036, its interval contains 0 → no established gap; TOST
    // at 0,10 does not establish equivalence → not-enough-data.
    expect(conclude(agent, human, 20, BALANCED)).toBe('not-enough-data');
  });

  it('accepte une marge d\'équivalence personnalisée pour conclure « pareil »', () => {
    const agent = proportion(34, 41);
    const human = proportion(32, 37);
    expect(conclude(agent, human, 20, BALANCED, 0.30)).toBe('same');
  });

  it('conclut « pire »/« mieux » sur des taux extrêmes 0 contre 1', () => {
    const zero = proportion(0, 20);
    const one = proportion(20, 20);
    expect(conclude(zero, one, 20, BALANCED)).toBe('worse');
    expect(conclude(one, zero, 20, BALANCED)).toBe('better');
  });

  it('refuse de conclure quand un bras n\'a aucun ticket mesuré (n = 0)', () => {
    expect(conclude(proportion(0, 0), proportion(45, 100), 20, BALANCED)).toBe('not-enough-data');
    expect(conclude(proportion(60, 100), proportion(0, 0), 20, BALANCED)).toBe('not-enough-data');
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
