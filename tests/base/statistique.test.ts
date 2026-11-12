/**
 * The statistics floor, traversed on the reference database.
 *
 * Covers: DP-08, DP-09, DP-29.
 *
 * Wilson, Newcombe, TOST, the median, Kaplan–Meier, the log-rank test and
 * Benjamini–Hochberg all run on the real effectives of the base.
 */
import { describe, expect, it } from 'vitest';
import { base, cohorte } from '../helpers/base.js';
import { wilsonInterval, median, medianOrNull } from '../../src/domain/stats.js';
import { newcombeDifference, tostEquivalence } from '../../src/domain/difference.js';
import { kaplanMeier, logRank, censoredShare } from '../../src/domain/survival.js';
import { benjaminiHochberg } from '../../src/domain/multiplicity.js';

describe('la statistique sur la base', () => {
  it('retrouve les trois couples du SPEC avec les intervalles de Wilson', () => {
    // SPEC §4 examples, recomputed on the real effectives of the base.
    expect(wilsonInterval(18, 26)).toMatchObject({ n: 26, rate: expect.closeTo(0.6923, 4), ciLow: expect.closeTo(0.50, 2) });
    expect(wilsonInterval(27, 31)).toMatchObject({ n: 31, rate: expect.closeTo(0.871, 3), ciLow: expect.closeTo(0.71, 2) });
    expect(wilsonInterval(34, 41)).toMatchObject({ n: 41, rate: expect.closeTo(0.829, 3), ciLow: expect.closeTo(0.69, 2) });
  });

  it('ne confond pas « pareil » et « mieux » : Newcombe sur un écart réel', () => {
    const better = cohorte('epoch-2|data-migration|data-pipeline|M');
    const diff = newcombeDifference(better.agentStat!, better.humanStat!);
    // The established gap dwarfs the intervals: the difference excludes 0.
    expect(diff.established).toBe(better.conclusion !== 'same');
    expect(diff.nA).toBe(better.agentStat!.n);
    expect(diff.nB).toBe(better.humanStat!.n);
  });

  it('différencie équivalence et écart net par TOST', () => {
    const same = cohorte('epoch-2|bugfix|api|M');
    const equivalent = tostEquivalence(same.agentStat!, same.humanStat!);
    expect(equivalent.margin).toBeGreaterThan(0);
    // The gap is not established (same conclusion): the interval straddles 0.
    const gap = newcombeDifference(same.agentStat!, same.humanStat!);
    expect(gap.established).toBe(false);
    expect(equivalent.diff).toBeCloseTo(gap.diff, 6);
  });

  it('mesure les délais par la médiane, jamais par la moyenne', () => {
    const verte = cohorte('epoch-2|data-migration|data-pipeline|M');
    // The median reads the closed tickets only: an open ticket has no delay yet.
    const leads = verte.agent.filter((ticket) => ticket.closed).map((ticket) => ticket.outcome.leadTimeH);
    expect(median(leads)).toBe(verte.agentLead?.medianH);
    expect(medianOrNull([])).toBeNull();
  });

  it('évalue la survie des tickets censurés de la base', () => {
    const current = base();
    const open = current.tickets.filter((ticket) => !ticket.closed);
    expect(open.length).toBeGreaterThan(0);
    const observations = current.tickets
      .filter((ticket) => ticket.arm === 'agent')
      .map((ticket) => ({ durationH: ticket.outcome.leadTimeH, event: ticket.closed }));
    const curve = kaplanMeier(observations);
    expect(curve.n).toBe(observations.length);
    const share = censoredShare(observations);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
  });

  it('teste le log-rank sur les deux bras de la base', () => {
    const arm = (bras: 'agent' | 'human') => base().tickets
      .filter((ticket) => ticket.arm === bras)
      .map((ticket) => ({ durationH: ticket.outcome.leadTimeH, event: ticket.closed }));
    const result = logRank(arm('agent'), arm('human'));
    expect(result.nA).toBe(arm('agent').length);
    expect(result.nB).toBe(arm('human').length);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it('corrige les tests multiples par Benjamini–Hochberg sur la base', () => {
    const cohorts = [cohorte('epoch-2|bugfix|api|M'), cohorte('epoch-2|bugfix|api|S'), cohorte('epoch-3|bugfix|web-ui|S')];
    const cells = cohorts.map((vue) => {
      const diff = newcombeDifference(vue.agentStat!, vue.humanStat!);
      return { key: vue.cle, pValue: diff.established ? 0.01 : 0.4 };
    });
    const adjusted = benjaminiHochberg(cells);
    expect(adjusted).toHaveLength(cells.length);
    // A rank is a permutation of the cells.
    expect(adjusted.map((cell) => cell.rank).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});