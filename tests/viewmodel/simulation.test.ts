/**
 * Tests of the simulation screen (SPEC §7, §8, §16; DP-08, DP-09, DP-12,
 * recipe 10).
 *
 * The screen is checked on what it says: the headline in the two languages,
 * the rate with its sample size and its interval (recipe 10), the gap of each
 * cohort, and the empty screen — no exception, no hole.
 */
import { describe, expect, it } from 'vitest';
import { simulationView, type SimulationView } from '../../src/viewmodel/simulation.js';
import type { PolicyVariant, SimulationTicket } from '../../src/domain/simulation.js';

/** The current rule (threshold 20, the three guardrails of SPEC §8). */
function policy(patch: Partial<PolicyVariant> = {}): PolicyVariant {
  return {
    id: 'current',
    label: { fr: 'Règle actuelle', en: 'Current rule' },
    threshold: 20,
    guardrails: ['incident', 'sensitive-zone', 'no-criteria'],
    decision: 'delegate',
    ...patch,
  };
}

/** The hand-built set: see the domain test, the numbers are the same. */
function demoTickets(): readonly SimulationTicket[] {
  const tickets: SimulationTicket[] = [];
  for (let index = 0; index < 40; index += 1) {
    const arm = index < 20 ? 'agent' : 'human';
    const reopened = index < 2;
    tickets.push({
      issueKey: `A-${index}`,
      cohortKey: 'bugfix/api/M',
      arm,
      clean: !reopened,
      reopened,
      leadTimeH: arm === 'agent' ? 4 : 12,
      hasIncident: false,
      sensitive: false,
      hasCriteria: true,
    });
  }
  for (let index = 0; index < 30; index += 1) {
    const arm = index < 15 ? 'agent' : 'human';
    const hasCriteria = index >= 9 && index < 21;
    const reopened = hasCriteria && index < 12;
    tickets.push({
      issueKey: `B-${index}`,
      cohortKey: 'feature/web/L',
      arm,
      clean: !reopened,
      reopened,
      leadTimeH: arm === 'agent' ? 6 : 18,
      hasIncident: false,
      sensitive: false,
      hasCriteria,
    });
  }
  return tickets;
}

/** Every visible string of the view, in both languages. */
function stringsOf(view: SimulationView): readonly string[] {
  const lines = [
    view.title, view.headline, view.rate, view.conclusion, view.note,
    view.baseline.label, view.baseline.threshold, view.baseline.delegated,
    view.baseline.kept, view.baseline.reopenings, view.baseline.cleanRate,
    view.baseline.medianLead,
    view.variant.label, view.variant.threshold, view.variant.delegated,
    view.variant.kept, view.variant.reopenings, view.variant.cleanRate,
    view.variant.medianLead,
  ];
  const cohorts = view.cohorts.flatMap((cohort) => [cohort.line]);
  return [...lines, ...cohorts].flatMap((line) => [line.fr, line.en]);
}

describe('simulationView (SPEC §16, DP-08)', () => {
  it('dit en clair ce que la règle changerait, en français et en anglais', () => {
    const view = simulationView({
      tickets: demoTickets(),
      baseline: policy(),
      variant: policy({ threshold: 15 }),
    });
    expect(view.empty).toBe(false);
    expect(view.headline.fr).toContain('seuil à 15');
    expect(view.headline.fr).toContain('12 tickets');
    expect(view.headline.fr).toContain('3 réouvertures');
    expect(view.headline.en).toContain('threshold to 15');
    expect(view.headline.en).toContain('12 more tickets');
    expect(view.headline.en).toContain('avoid 3 reopenings');
  });

  it('montre le taux avec son effectif et sa fourchette (recette 10)', () => {
    const view = simulationView({
      tickets: demoTickets(),
      baseline: policy(),
      variant: policy({ threshold: 15 }),
    });
    expect(view.rate.fr).toContain('n = 52');
    expect(view.rate.fr).toContain('IC 95 %');
    expect(view.rate.fr).toContain('[');
    expect(view.rate.en).toContain('n = 52');
    expect(view.rate.en).toContain('95% CI');
    expect(view.variant.cleanRate.fr).toContain('n = 52');
  });

  it('liste les écarts par cohorte', () => {
    const view = simulationView({
      tickets: demoTickets(),
      baseline: policy(),
      variant: policy({ threshold: 15 }),
    });
    expect(view.cohorts.map((cohort) => cohort.cohortKey)).toEqual(['bugfix/api/M', 'feature/web/L']);
    expect(view.cohorts[1].delegatedDelta).toBe(12);
    expect(view.cohorts[1].reopeningsAvoided).toBe(3);
    expect(view.cohorts[1].line.fr).toContain('feature/web/L');
    expect(view.cohorts[1].line.en).toContain('feature/web/L');
  });

  it('donne le verdict de SPEC §7 règle 4', () => {
    const view = simulationView({
      tickets: demoTickets(),
      baseline: policy(),
      variant: policy({ threshold: 15 }),
    });
    expect(view.conclusion.fr).toContain('écart non établi');
    expect(view.conclusion.en).toContain('gap not established');
  });

  it('s’affiche sans donnée, sans exception et sans trou', () => {
    const view = simulationView(null);
    expect(view.empty).toBe(true);
    expect(view.cohorts).toEqual([]);
    expect(view.headline.fr.length).toBeGreaterThan(0);
    expect(view.note.en.length).toBeGreaterThan(0);
    for (const text of stringsOf(view)) {
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('NaN');
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('s’affiche sans donnée quand aucun ticket n’est fourni', () => {
    const view = simulationView({ tickets: [], baseline: policy(), variant: policy() });
    expect(view.empty).toBe(true);
    expect(view.rate.fr).toContain('Aucun taux mesuré');
    expect(view.rate.en).toContain('No rate measured');
  });

  it('ne laisse aucun trou dans la vue complète', () => {
    const view = simulationView({
      tickets: demoTickets(),
      baseline: policy(),
      variant: policy({ threshold: 15 }),
    });
    for (const text of stringsOf(view)) {
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('NaN');
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
