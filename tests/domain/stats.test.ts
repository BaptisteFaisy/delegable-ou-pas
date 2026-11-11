/**
 * Tests of `src/domain/stats.ts` — DP-08, DP-09, SPEC §7 rule 3, SPEC §20,
 * METHODE.md §1 and §2, recipe 10.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MIN_ARM_SIZE,
  Z_95,
  median,
  medianDuration,
  medianInterval,
  medianOrNull,
  percent,
  proportion,
  share,
  wilsonInterval,
} from '../../src/domain/stats.js';

/** Tolerance of the specification on an interval bound, in fraction. */
const TOLERANCE = 0.01;

/** The three games of the specification, with the interval it displays. */
const SPEC_GAMES: ReadonlyArray<{ successes: number; n: number; low: number; high: number }> = [
  { successes: 34, n: 41, low: 0.69, high: 0.91 },
  { successes: 32, n: 37, low: 0.72, high: 0.94 },
  { successes: 18, n: 26, low: 0.5, high: 0.84 },
];

describe('stats honnêtes', () => {
  it('recette-10 : rend toute proportion avec son effectif et sa fourchette', () => {
    const stat = proportion(34, 41);
    expect(Object.keys(stat).sort()).toEqual(['ciHigh', 'ciLow', 'n', 'rate']);
    expect(stat.n).toBe(41);
  });

  it('retombe sur les trois jeux du cahier des charges, preuve que c’est Wilson', () => {
    for (const game of SPEC_GAMES) {
      const stat = wilsonInterval(game.successes, game.n);
      expect(Math.abs(stat.ciLow - game.low)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(stat.ciHigh - game.high)).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it('emploie le quantile de 95 % et un seuil de 20 tickets par bras', () => {
    expect(Z_95).toBe(1.96);
    expect(DEFAULT_MIN_ARM_SIZE).toBe(20);
  });

  it('rend une fourchette pleine quand aucun ticket n’a été mesuré', () => {
    expect(wilsonInterval(0, 0)).toEqual({ n: 0, rate: 0, ciLow: 0, ciHigh: 1 });
  });

  it('borne la fourchette à zéro quand aucun ticket n’a réussi', () => {
    const stat = wilsonInterval(0, 20);
    expect(stat.rate).toBe(0);
    expect(stat.ciLow).toBe(0);
    expect(stat.ciHigh).toBeGreaterThan(0);
  });

  it('borne la fourchette à un quand tous les tickets ont réussi', () => {
    const stat = wilsonInterval(20, 20);
    expect(stat.rate).toBe(1);
    expect(stat.ciHigh).toBe(1);
    expect(stat.ciLow).toBeLessThan(1);
  });

  it('écrète la fourchette entre zéro et un quand les succès débordent l’effectif', () => {
    const stat = wilsonInterval(30, 20);
    expect(stat.rate).toBe(1);
    expect(stat.ciHigh).toBe(1);
  });

  it('calcule la médiane d’une liste impaire', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('calcule la médiane d’une liste paire', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('rend zéro pour la médiane d’une liste vide, et null quand on veut le savoir', () => {
    expect(median([])).toBe(0);
    expect(medianOrNull([])).toBeNull();
    expect(medianOrNull([7])).toBe(7);
  });

  it('laisse la médiane absorber un ticket resté ouvert trois mois', () => {
    const hours = [8, 9, 10, 11, 12, 2160];
    expect(median(hours)).toBe(10.5);
  });

  it('rend une durée médiane avec son effectif', () => {
    expect(medianDuration([10, 20, 30])).toEqual({ n: 3, medianH: 20 });
  });

  it('rend une durée vide sans effectif plutôt qu’une exception', () => {
    expect(medianDuration([])).toEqual({ n: 0, medianH: 0 });
    expect(medianInterval([])).toEqual({ n: 0, medianH: 0, ciLow: 0, ciHigh: 0 });
  });

  it('borne la médiane par un intervalle qui la contient', () => {
    const hours = Array.from({ length: 20 }, (_, index) => index + 1);
    const interval = medianInterval(hours);
    expect(interval.medianH).toBe(10.5);
    expect(interval.ciLow).toBe(6);
    expect(interval.ciHigh).toBe(15);
  });

  it('borde la médiane d’un seul ticket par ce ticket', () => {
    expect(medianInterval([42])).toEqual({ n: 1, medianH: 42, ciLow: 42, ciHigh: 42 });
  });

  it('calcule une part comprise entre zéro et un', () => {
    expect(share(34, 41)).toBeCloseTo(0.8293, 4);
    expect(share(5, 2)).toBe(1);
    expect(share(-3, 10)).toBe(0);
  });

  it('rend zéro quand le tout est vide', () => {
    expect(share(3, 0)).toBe(0);
  });

  it('formate un taux en pourcentage', () => {
    expect(percent(34 / 41)).toBe('83 %');
    expect(percent(0)).toBe('0 %');
    expect(percent(1)).toBe('100 %');
  });
});
