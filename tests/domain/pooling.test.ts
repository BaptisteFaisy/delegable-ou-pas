/**
 * The hierarchical pooling of the cohorts of the same nature (feature E3).
 *
 * What is checked here: the prior is measured on the spot, the borrowed
 * strength grows as the cohort shrinks, and — the promise of the feature —
 * pooling NEVER narrows an interval, whatever the cohort.
 */
import { describe, expect, it } from 'vitest';
import { proportion } from '../../src/domain/stats.js';
import { empiricalPrior, poolCohorts, poolProportion } from '../../src/domain/pooling.js';
import type { PoolingInput } from '../../src/domain/pooling.js';

/** Nine sibling cohorts of the same nature: clean closures around 60 %. */
const SIBLINGS: readonly { readonly clean: number; readonly total: number }[] = [
  { clean: 30, total: 50 },
  { clean: 27, total: 50 },
  { clean: 33, total: 50 },
  { clean: 30, total: 50 },
  { clean: 24, total: 40 },
  { clean: 34, total: 50 },
  { clean: 27, total: 50 },
  { clean: 30, total: 50 },
  { clean: 26, total: 50 },
];

/**
 * A deterministic pseudo-random generator (Park-Miller): the draws of the
 * safety test must repeat exactly, run after run.
 */
function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe('empiricalPrior (E3)', () => {
  it('mesure la priori sur place : moyenne et écart-type des cohortes de même nature', () => {
    const prior = empiricalPrior(SIBLINGS);
    expect(prior.observations).toBe(9);
    expect(prior.mean).toBeCloseTo(0.593333, 5);
    expect(prior.sd).toBeCloseTo(0.053852, 4);
  });

  it('ignore les cohortes sans ticket : elles ne disent rien de la dispersion', () => {
    const prior = empiricalPrior([...SIBLINGS, { clean: 0, total: 0 }]);
    expect(prior.observations).toBe(9);
    expect(prior.mean).toBeCloseTo(0.593333, 5);
  });

  it('est stable : même famille, même priors, quel que soit l’ordre', () => {
    const direct = empiricalPrior(SIBLINGS);
    const reversed = empiricalPrior([...SIBLINGS].reverse());
    expect(reversed.mean).toBeCloseTo(direct.mean, 12);
    expect(reversed.sd).toBeCloseTo(direct.sd, 12);
    expect(reversed.observations).toBe(direct.observations);
    expect(reversed.strength).toBe(direct.strength);
    expect(empiricalPrior(SIBLINGS).mean).toBe(direct.mean);
  });

  it('reste une prior sans donnée quand aucune cohorte n’a de ticket', () => {
    const prior = empiricalPrior([{ clean: 0, total: 0 }]);
    expect(prior.observations).toBe(0);
    expect(prior.mean).toBe(0);
    expect(prior.sd).toBe(0);
  });
});

describe('poolProportion (E3)', () => {
  it('une cohorte de 12 et une de 200 de la même cohorte mère : la petite est plus large, la grande inchangée', () => {
    const prior = empiricalPrior(SIBLINGS);
    const small = poolProportion(proportion(5, 12), prior);
    const big = poolProportion(proportion(120, 200), prior);

    const smallOwnWidth = small.own.ciHigh - small.own.ciLow;
    const smallPooledWidth = small.pooled.ciHigh - small.pooled.ciLow;
    expect(smallPooledWidth).toBeGreaterThan(smallOwnWidth);
    expect(small.borrowedStrength).toBeGreaterThan(0);

    expect(big.borrowedStrength).toBe(0);
    expect(big.pooled.ciLow).toBe(big.own.ciLow);
    expect(big.pooled.ciHigh).toBe(big.own.ciHigh);
    expect(big.shrunk).toBe(false);
  });

  it('la force empruntée croît quand la cohorte rétrécit', () => {
    const prior = empiricalPrior(SIBLINGS);
    const sizes = [4, 8, 12, 19, 20, 50, 200];
    const weights = sizes.map((size) =>
      poolProportion(proportion(Math.round(size / 2), size), prior).borrowedStrength,
    );
    for (let index = 1; index < weights.length; index += 1) {
      expect(weights[index]).toBeLessThanOrEqual(weights[index - 1]);
    }
    expect(weights[0]).toBeGreaterThan(0);
    expect(weights[weights.length - 1]).toBe(0);
  });

  it('au-dessus de l’effectif concluant, il n’y a rien à emprunter', () => {
    const prior = empiricalPrior(SIBLINGS);
    const conclusive = poolProportion(proportion(10, 20), prior);
    expect(conclusive.borrowedStrength).toBe(0);
    expect(conclusive.pooled).toEqual(conclusive.own);
  });

  it('l’intervalle poolé n’est jamais plus étroit que l’intervalle propre (200 tirages)', () => {
    const prior = empiricalPrior(SIBLINGS);
    const random = seededRandom(20261112);
    for (let draw = 0; draw < 200; draw += 1) {
      const n = 3 + Math.floor(random() * 60);
      const clean = Math.floor(random() * (n + 1));
      const own = proportion(clean, n);
      const pooled = poolProportion(own, prior);
      expect(pooled.pooled.ciLow).toBeLessThanOrEqual(own.ciLow + 1e-12);
      expect(pooled.pooled.ciHigh).toBeGreaterThanOrEqual(own.ciHigh - 1e-12);
      const ownWidth = own.ciHigh - own.ciLow;
      const pooledWidth = pooled.pooled.ciHigh - pooled.pooled.ciLow;
      expect(pooledWidth).toBeGreaterThanOrEqual(ownWidth - 1e-12);
    }
  });

  it('la force est réglable : à zéro, rien n’est emprunté', () => {
    const prior = empiricalPrior(SIBLINGS);
    const own = proportion(5, 12);
    const off = poolProportion(own, prior, 0);
    expect(off.borrowedStrength).toBe(0);
    expect(off.pooled.ciLow).toBe(own.ciLow);
    expect(off.pooled.ciHigh).toBe(own.ciHigh);
    const half = poolProportion(own, prior, 0.5).borrowedStrength;
    const full = poolProportion(own, prior, 1).borrowedStrength;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
  });

  it('le résultat reste une proportion : effectif, taux et intervalle', () => {
    const prior = empiricalPrior(SIBLINGS);
    const pooled = poolProportion(proportion(5, 12), prior);
    expect(pooled.pooled.n).toBe(12);
    expect(pooled.pooled.rate).toBeGreaterThanOrEqual(0);
    expect(pooled.pooled.rate).toBeLessThanOrEqual(1);
    expect(pooled.pooled.ciLow).toBeLessThanOrEqual(pooled.pooled.rate);
    expect(pooled.pooled.rate).toBeLessThanOrEqual(pooled.pooled.ciHigh);
  });

  it('une cohorte sans ticket ne fait pas tomber le module', () => {
    const prior = empiricalPrior(SIBLINGS);
    const empty = poolProportion(proportion(0, 0), prior);
    expect(empty.borrowedStrength).toBe(0);
    expect(empty.pooled.n).toBe(0);
    expect(empty.pooled.ciLow).toBe(0);
    expect(empty.pooled.ciHigh).toBe(1);
  });

  it('une prior sans dispersion n’avale pas la cohorte', () => {
    const lonely = empiricalPrior([{ clean: 6, total: 10 }]);
    const pooled = poolProportion(proportion(5, 12), lonely);
    expect(pooled.borrowedStrength).toBeLessThan(1);
    expect(pooled.borrowedStrength).toBeGreaterThan(0);
  });

  it('la démo numérique : la cohorte de 12 tickets passe de [19 % ; 69 %] à [14 % ; 86 %]', () => {
    const prior = empiricalPrior(SIBLINGS);
    const pooled = poolProportion(proportion(5, 12), prior);
    expect(Math.floor(pooled.own.ciLow * 100)).toBe(19);
    expect(Math.ceil(pooled.own.ciHigh * 100)).toBe(69);
    expect(Math.floor(pooled.pooled.ciLow * 100)).toBe(14);
    expect(Math.ceil(pooled.pooled.ciHigh * 100)).toBe(86);
    expect(Math.round(pooled.borrowedStrength * 100)).toBe(89);
    expect(Math.round(pooled.pooled.rate * 100)).toBe(57);
  });

  it('dit en clair ce qui a été emprunté, dans les deux langues', () => {
    const prior = empiricalPrior(SIBLINGS);
    const note = poolProportion(proportion(5, 12), prior).note;
    expect(note.fr).toContain('12');
    expect(note.fr).toContain('9 cohortes');
    expect(note.en).toContain('12');
    expect(note.en).toContain('9 cohorts');
  });
});

describe('poolCohorts (E3)', () => {
  it('répond dans l’ordre des entrées, une estimation par cohorte', () => {
    const prior = empiricalPrior(SIBLINGS);
    const inputs: readonly PoolingInput[] = [
      { cohortKey: 'a', own: proportion(5, 12), prior },
      { cohortKey: 'b', own: proportion(120, 200), prior },
    ];
    const estimates = poolCohorts(inputs);
    expect(estimates).toHaveLength(2);
    expect(estimates[0].borrowedStrength).toBeGreaterThan(0);
    expect(estimates[1].borrowedStrength).toBe(0);
  });

  it('ne répond rien sur une liste vide', () => {
    expect(poolCohorts([])).toEqual([]);
  });
});
