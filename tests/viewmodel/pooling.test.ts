/**
 * The pooling screen as a projection (feature E3): what the screen says in
 * clear words about a small cohort pooled with its siblings.
 */
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../../src/i18n/index.js';
import { proportion } from '../../src/domain/stats.js';
import { empiricalPrior } from '../../src/domain/pooling.js';
import type { PoolingInput } from '../../src/domain/pooling.js';
import { poolingView } from '../../src/viewmodel/pooling.js';

const fr = createTranslator('fr');

/** Nine sibling cohorts of the same nature. */
const PRIOR = empiricalPrior([
  { clean: 30, total: 50 },
  { clean: 27, total: 50 },
  { clean: 33, total: 50 },
  { clean: 30, total: 50 },
  { clean: 24, total: 40 },
  { clean: 34, total: 50 },
  { clean: 27, total: 50 },
  { clean: 30, total: 50 },
  { clean: 26, total: 50 },
]);

/** A small cohort and a big one, both of the same nature. */
const INPUTS: readonly PoolingInput[] = [
  { cohortKey: 'nature-test', own: proportion(5, 12), prior: PRIOR },
  { cohortKey: 'nature-test-large', own: proportion(120, 200), prior: PRIOR },
];

/** The two bounds of an interval as the screen shows them, e.g. "[19 % ; 68 %]". */
function bounds(interval: string): [number, number] {
  const match = /\[(\d+) % ; (\d+) %\]/.exec(interval);
  if (match === null) throw new Error(`intervalle illisible : ${interval}`);
  return [Number(match[1]), Number(match[2])];
}

describe('poolingView (E3)', () => {
  it('se rend sans donnée', () => {
    const view = poolingView([], fr);
    expect(view.rows).toEqual([]);
    expect(view.emptyNotice).not.toBeNull();
    expect(view.emptyNotice?.fr.length).toBeGreaterThan(0);
    expect(view.emptyNotice?.en.length).toBeGreaterThan(0);
  });

  it('montre l’intervalle propre et l’intervalle poolé, avec leur effectif', () => {
    const view = poolingView(INPUTS, fr);
    const row = view.rows[0];
    expect(row.own.n).toBe(12);
    expect(row.own.text).toContain('n = 12');
    expect(row.pooled.text).toContain('n = 12');
    expect(row.own.interval).toMatch(/^\[\d+ % ; \d+ %\]$/);
    expect(row.pooled.interval).toMatch(/^\[\d+ % ; \d+ %\]$/);
  });

  it('n’affiche jamais une fourchette plus étroite que celle de la cohorte seule', () => {
    const view = poolingView(INPUTS, fr);
    for (const row of view.rows) {
      const [ownLow, ownHigh] = bounds(row.own.interval);
      const [pooledLow, pooledHigh] = bounds(row.pooled.interval);
      expect(pooledLow).toBeLessThanOrEqual(ownLow);
      expect(pooledHigh).toBeGreaterThanOrEqual(ownHigh);
    }
  });

  it('dit la part de force empruntée', () => {
    const view = poolingView(INPUTS, fr);
    const row = view.rows[0];
    expect(row.borrowedShare).toBeGreaterThan(0);
    expect(row.borrowedShare).toBeLessThanOrEqual(1);
    expect(row.borrowedShareText).toContain('%');
    expect(row.headline.fr).toContain('force empruntée');
    expect(row.headline.en).toContain('strength borrowed');
  });

  it('dit en clair ce qu’il faut de la cohorte et de ce qu’elle devient', () => {
    const view = poolingView(INPUTS, fr);
    const row = view.rows[0];
    expect(row.headline.fr).toContain('12 tickets');
    expect(row.headline.fr).toContain('9 cohortes de même nature');
    expect(row.headline.en).toContain('12 tickets');
    expect(row.headline.en).toContain('9 cohorts of the same nature');
  });

  it('parle français et anglais', () => {
    const view = poolingView(INPUTS, fr);
    const row = view.rows[0];
    expect(row.headline.fr).not.toBe(row.headline.en);
    expect(row.note.fr).not.toBe(row.note.en);
    expect(view.title.fr).not.toBe(view.title.en);
  });

  it('n’emprunte rien d’une cohorte assez grande pour conclure seule', () => {
    const view = poolingView(INPUTS, fr);
    const big = view.rows[1];
    expect(big.borrowedShare).toBe(0);
    expect(big.shrunk).toBe(false);
    expect(big.headline.fr).toContain("rien n'est emprunté");
  });
});
