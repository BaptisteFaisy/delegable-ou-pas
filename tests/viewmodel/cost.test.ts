/**
 * The compared cost of the two options, as a screen shows it (SPEC §8, §20).
 */
import { describe, expect, it } from 'vitest';
import { costView, portfolioCostView } from '../../src/viewmodel/cost.js';
import { cohortCost } from '../../src/domain/cost.js';

const INPUT = {
  cohortKey: 'bugfix-billing-M',
  agentClean: 34,
  agentTotal: 40,
  humanClean: 18,
  humanTotal: 26,
  reopenings: 2,
};

describe('costView', () => {
  it('montre les deux coûts et l’économie', () => {
    const view = costView(INPUT, 'fr');
    expect(view.cohortKey).toBe('bugfix-billing-M');
    expect(view.agentCost).toMatch(/^\d+\.\d{2} €$/);
    expect(view.humanCost).toMatch(/^\d+\.\d{2} €$/);
    expect(view.saved).toMatch(/^\d+\.\d{2} €$/);
    expect(view.savedShareText).toContain('%');
  });

  it('montre la différence de qualité avec son effectif et son intervalle', () => {
    const view = costView(INPUT, 'fr');
    expect(view.quality).not.toBeNull();
    expect(view.quality?.n).toBe(40);
    expect(view.quality?.text).toContain('n = 40');
    expect(view.quality?.interval).toMatch(/^\[\d+ % ; \d+ %\]$/);
    expect(view.qualityDelta).toBeGreaterThan(0);
  });

  it('dit que la comparaison n’a pas d’objet sans ticket délégué', () => {
    const view = costView({ ...INPUT, agentTotal: 0, agentClean: 0 }, 'fr');
    expect(view.noObject).toBe(true);
    expect(view.noObjectNotice).not.toBeNull();
    expect(view.noObjectNotice?.fr.length).toBeGreaterThan(0);
    expect(view.noObjectNotice?.en.length).toBeGreaterThan(0);
    expect(view.quality).toBeNull();
  });

  it('rappelle que le coût vient d’un modèle d’hypothèses', () => {
    const view = costView(INPUT, 'fr');
    expect(view.note.fr).toContain('hypothèses');
    expect(view.note.en).toContain('assumption');
  });

  it('parle français et anglais', () => {
    const view = costView(INPUT, 'fr');
    expect(view.title.fr).not.toBe(view.title.en);
    expect(view.agentLabel.fr).not.toBe(view.agentLabel.en);
    expect(view.humanLabel.fr).not.toBe(view.humanLabel.en);
  });
});

describe('portfolioCostView', () => {
  it('se rend sans cohorte', () => {
    const view = portfolioCostView([], 'fr');
    expect(view.emptyNotice).not.toBeNull();
    expect(view.emptyNotice?.fr.length).toBeGreaterThan(0);
    expect(view.saved).toMatch(/^\d+\.\d{2} €$/);
  });

  it('agrège les cohortes', () => {
    const view = portfolioCostView([cohortCost(INPUT)], 'fr');
    expect(view.emptyNotice).toBeNull();
    expect(view.totalAgent).toMatch(/^\d+\.\d{2} €$/);
    expect(view.totalHuman).toMatch(/^\d+\.\d{2} €$/);
    expect(view.qualityWeighted).toBeGreaterThan(0);
  });
});
