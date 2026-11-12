/**
 * Tests of the cost comparison.
 *
 * The point of the module: turn a technical recommendation into an economic
 * one — while saying out loud that the cost rests on assumptions. The tests
 * therefore check the arithmetic on a hand-made case, the direction of each
 * effect (more review, more cost), the honesty of the quality interval (it
 * must contain zero when nothing is established), and the bounds.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COST_MODEL,
  cohortCost,
  portfolioCost,
} from '../../src/domain/cost.js';

const INPUT = {
  cohortKey: 'data-migration|billing|M',
  agentClean: 18,
  agentTotal: 26,
  humanClean: 27,
  humanTotal: 31,
  reopenings: 3,
};

describe('coût d’une cohorte', () => {
  it('calcule le coût agent et le coût humain sur un cas fait main', () => {
    const cost = cohortCost(INPUT);
    const model = DEFAULT_COST_MODEL;
    const run = model.tokenCostPerRun + model.machineCostPerRun;
    const reviewHours = model.reviewHoursPerTicket * INPUT.agentTotal;
    const reworkHours = model.reworkHoursPerTicket * INPUT.reopenings;
    const expectedAgent = run * INPUT.agentTotal
      + (reviewHours + reworkHours) * model.humanHourlyCost;
    const expectedHuman = model.humanHoursPerTicket * INPUT.humanTotal * model.humanHourlyCost;
    expect(cost.agentCost).toBeCloseTo(expectedAgent, 2);
    expect(cost.humanCost).toBeCloseTo(expectedHuman, 2);
    expect(cost.saved).toBeCloseTo(expectedHuman - expectedAgent, 2);
    expect(cost.reviewHours).toBeCloseTo(reviewHours, 2);
  });

  it('la part économisée est bornée et le résultat est chiffré', () => {
    const cost = cohortCost(INPUT);
    expect(cost.savedShare).toBeGreaterThan(0);
    expect(cost.savedShare).toBeLessThanOrEqual(1);
    expect(cost.note.fr).toContain('hypothèses');
    expect(cost.note.en).toContain('assumption');
  });

  it('la qualité est une différence de taux, avec effectif et fourchette', () => {
    const cost = cohortCost(INPUT);
    expect(cost.quality.n).toBe(26);
    expect(cost.quality.rate).toBeCloseTo(18 / 26 - 27 / 31, 3);
    // Rien n'est établi ici : l'intervalle contient zéro — la règle du SPEC §7.
    expect(cost.quality.ciLow).toBeLessThan(0);
    expect(cost.quality.ciHigh).toBeGreaterThan(0);
    expect(cost.qualityDelta).toBeCloseTo((18 / 26 - 27 / 31) * 100, 1);
  });

  it('plus de relecture coûte plus cher', () => {
    const cheap = cohortCost(INPUT, { ...DEFAULT_COST_MODEL, reviewHoursPerTicket: 0.5 });
    const dear = cohortCost(INPUT, { ...DEFAULT_COST_MODEL, reviewHoursPerTicket: 2 });
    expect(dear.agentCost).toBeGreaterThan(cheap.agentCost);
    expect(dear.saved).toBeLessThan(cheap.saved);
  });

  it('plus de reprises coûte plus cher', () => {
    const few = cohortCost({ ...INPUT, reopenings: 1 });
    const many = cohortCost({ ...INPUT, reopenings: 9 });
    expect(many.agentCost).toBeGreaterThan(few.agentCost);
  });

  it('un modèle de coût est un modèle : il se règle', () => {
    const other = cohortCost(INPUT, {
      ...DEFAULT_COST_MODEL,
      humanHourlyCost: 100,
      humanHoursPerTicket: 8,
    });
    const base = cohortCost(INPUT);
    expect(other.humanCost).toBeGreaterThan(base.humanCost);
  });

  it('une cohorte sans ticket ne coûte rien et ne plante pas', () => {
    const cost = cohortCost({ ...INPUT, agentTotal: 0, agentClean: 0, reopenings: 0 });
    expect(cost.agentCost).toBe(0);
    expect(cost.savedShare).toBe(0);
  });
});

describe('coût de portefeuille', () => {
  it('agrège les cohortes et pondère la qualité par la taille', () => {
    const a = cohortCost(INPUT);
    const b = cohortCost({ ...INPUT, cohortKey: 'bugfix|api|S', agentClean: 50, agentTotal: 60, humanClean: 45, humanTotal: 55 });
    const portfolio = portfolioCost([a, b]);
    expect(portfolio.totalAgent).toBeCloseTo(a.agentCost + b.agentCost, 2);
    expect(portfolio.totalHuman).toBeCloseTo(a.humanCost + b.humanCost, 2);
    expect(portfolio.saved).toBeCloseTo(portfolio.totalHuman - portfolio.totalAgent, 2);
    expect(portfolio.savedShare).toBeGreaterThan(0);
    expect(portfolio.qualityWeighted).toBeGreaterThan(-100);
  });

  it('un portefeuille vide ne plante pas', () => {
    const portfolio = portfolioCost([]);
    expect(portfolio.totalAgent).toBe(0);
    expect(portfolio.savedShare).toBe(0);
    expect(portfolio.qualityWeighted).toBe(0);
  });
});
