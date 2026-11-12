/**
 * Tests of the simulation mode (SPEC §7, §8; DP-08, DP-09, DP-12, recipe 10).
 *
 * The set of tickets is built by hand, so every expected number can be read
 * on the spot: two cohorts, one of them just under the threshold, and three
 * tickets that were reopened.
 */
import { describe, expect, it } from 'vitest';
import { CONCLUSIONS } from '../../src/types.js';
import { proportion } from '../../src/domain/stats.js';
import {
  defaultVariants,
  policyVersion,
  simulate,
  simulateCohorts,
  simulateThresholds,
  type PolicyVariant,
  type SimulationTicket,
} from '../../src/domain/simulation.js';

/** A policy with the three guardrails of SPEC §8, patchable. */
function policy(patch: Partial<PolicyVariant> = {}): PolicyVariant {
  return {
    id: 'p',
    label: { fr: 'Règle', en: 'Rule' },
    threshold: 20,
    guardrails: ['incident', 'sensitive-zone', 'no-criteria'],
    decision: 'delegate',
    ...patch,
  };
}

/** A cohort of `agents` agent tickets and `humans` human tickets. */
function cohort(
  key: string,
  agents: number,
  humans: number,
  reopened: number,
  leadAgent = 4,
  leadHuman = 12,
): readonly SimulationTicket[] {
  const tickets: SimulationTicket[] = [];
  for (let index = 0; index < agents + humans; index += 1) {
    const arm = index < agents ? 'agent' : 'human';
    const isReopened = index < reopened;
    tickets.push({
      issueKey: `${key}-${index}`,
      cohortKey: key,
      arm,
      clean: !isReopened,
      reopened: isReopened,
      leadTimeH: arm === 'agent' ? leadAgent : leadHuman,
      hasIncident: false,
      sensitive: false,
      hasCriteria: true,
    });
  }
  return tickets;
}

/**
 * The hand-built set:
 *  - cohort A: 20 agent + 20 human, all delegable, 2 reopened;
 *  - cohort B: 15 agent + 15 human — under the threshold of 20, and 18 of
 *    its 30 tickets have no acceptance criteria (the guardrail keeps them);
 *    3 of the 12 others were reopened.
 */
function demoTickets(): readonly SimulationTicket[] {
  const tickets: SimulationTicket[] = [...cohort('bugfix/api/M', 20, 20, 2)];
  for (let index = 0; index < 30; index += 1) {
    const arm = index < 15 ? 'agent' : 'human';
    const hasCriteria = index >= 9 && index < 21;
    const reopened = hasCriteria && index < 12;
    tickets.push({
      issueKey: `feature-web-L-${index}`,
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

describe('simulate (SPEC §7, §8, DP-12)', () => {
  it('dit combien de tickets de plus sont délégués et combien de réouvertures sont évitées', () => {
    const outcome = simulate({
      tickets: demoTickets(),
      baseline: policy({ threshold: 20 }),
      variant: policy({ threshold: 15 }),
    });
    // Cohort A (20/20) is delegable in both; cohort B (15/15) only under 15,
    // and the guardrail keeps 18 of its 30 tickets: 12 tickets of more.
    expect(outcome.delta.delegatedDelta).toBe(12);
    expect(outcome.baseline.delegated).toBe(40);
    expect(outcome.variant.delegated).toBe(52);
    // The 3 reopened tickets of cohort B left the human path: 3 avoided.
    expect(outcome.baseline.reopenings).toBe(3);
    expect(outcome.variant.reopenings).toBe(0);
    expect(outcome.delta.reopeningsAvoided).toBe(3);
  });

  it('garde la population conservée et la population déléguée dans le compte', () => {
    const outcome = simulate({
      tickets: demoTickets(),
      baseline: policy({ threshold: 20 }),
      variant: policy({ threshold: 15 }),
    });
    expect(outcome.baseline.delegated + outcome.baseline.kept).toBe(70);
    expect(outcome.variant.delegated + outcome.variant.kept).toBe(70);
    expect(outcome.baseline.cleanClosed).toBe(38);
    expect(outcome.variant.cleanClosed).toBe(47);
    expect(outcome.baseline.medianLeadH).toBe(8);
    expect(outcome.variant.medianLeadH).toBe(9);
  });

  it('retire le ticket du garde-fou dans les deux variantes', () => {
    const tickets = cohort('bugfix/api/M', 6, 6, 0).map((ticket, index) => (
      index === 0 ? { ...ticket, hasIncident: true } : ticket
    ));
    const guarded = policy({ threshold: 5 });
    const outcome = simulate({ tickets, baseline: guarded, variant: guarded });
    expect(outcome.baseline.delegated).toBe(11);
    expect(outcome.variant.delegated).toBe(11);
    expect(outcome.baseline.kept).toBe(1);
    expect(outcome.variant.kept).toBe(1);
  });

  it('ne retient le ticket que dans la variante où le garde-fou est actif', () => {
    const tickets = cohort('bugfix/api/M', 6, 6, 0).map((ticket, index) => (
      index === 0 ? { ...ticket, hasIncident: true } : ticket
    ));
    const outcome = simulate({
      tickets,
      baseline: policy({ threshold: 5 }),
      variant: policy({ threshold: 5, guardrails: [] }),
    });
    expect(outcome.baseline.delegated).toBe(11);
    expect(outcome.variant.delegated).toBe(12);
  });

  it('ne délègue rien quand la règle décide de tout conserver', () => {
    const outcome = simulate({
      tickets: demoTickets(),
      baseline: policy({ threshold: 20 }),
      variant: policy({ threshold: 20, decision: 'always-keep' }),
    });
    expect(outcome.variant.delegated).toBe(0);
    expect(outcome.variant.kept).toBe(70);
    expect(outcome.variant.rate.n).toBe(0);
    expect(outcome.variant.medianLeadH).toBeNull();
  });

  it('donne une conclusion parmi les quatre (SPEC §7 règle 4)', () => {
    const outcome = simulate({
      tickets: demoTickets(),
      baseline: policy({ threshold: 20 }),
      variant: policy({ threshold: 15 }),
    });
    expect(CONCLUSIONS).toContain(outcome.delta.conclusion);
    expect(outcome.delta.conclusion).toBe('same');
  });

  it('ne rétrécit jamais la fourchette quand l’effectif baisse', () => {
    const tickets = [
      ...cohort('wide', 20, 20, 4),
      ...cohort('narrow', 10, 10, 2),
    ];
    const outcome = simulate({
      tickets,
      baseline: policy({ threshold: 20 }),
      variant: policy({ threshold: 10 }),
    });
    // Same clean rate (90 %), fewer tickets: the interval is wider, never narrower.
    expect(outcome.baseline.rate.n).toBe(40);
    expect(outcome.variant.rate.n).toBe(60);
    const widthOf = (stat: { ciLow: number; ciHigh: number }): number => stat.ciHigh - stat.ciLow;
    expect(widthOf(outcome.baseline.rate)).toBeGreaterThan(widthOf(outcome.variant.rate));
  });
});

describe('rateDelta (SPEC §7 règle 3, recette 10)', () => {
  it('porte la fourchette de la population simulée, jamais un taux nu', () => {
    const outcome = simulate({
      tickets: demoTickets(),
      baseline: policy({ threshold: 20 }),
      variant: policy({ threshold: 15 }),
    });
    const expected = proportion(outcome.variant.cleanClosed, outcome.variant.delegated);
    expect(outcome.delta.rateDelta).toEqual(expected);
    expect(outcome.delta.rateDelta.n).toBe(52);
    expect(outcome.delta.rateDelta.ciHigh - outcome.delta.rateDelta.ciLow).toBeGreaterThan(0);
    expect(outcome.delta.rateDelta.ciLow).toBeLessThanOrEqual(outcome.delta.rateDelta.rate);
    expect(outcome.delta.rateDelta.rate).toBeLessThanOrEqual(outcome.delta.rateDelta.ciHigh);
  });
});

describe('policyVersion (SPEC §16, DP-08)', () => {
  it('donne la même chaîne pour la même règle', () => {
    const one = policy({ threshold: 15, decision: 'review' });
    const same = policy({ threshold: 15, decision: 'review' });
    expect(policyVersion(one)).toBe(policyVersion(same));
    expect(policyVersion(one)).not.toBe('');
  });

  it('donne une autre chaîne dès que la règle change', () => {
    const base = policy({ threshold: 15 });
    expect(policyVersion(base)).not.toBe(policyVersion(policy({ threshold: 30 })));
    expect(policyVersion(base)).not.toBe(policyVersion(policy({ threshold: 15, decision: 'review' })));
    expect(policyVersion(base)).not.toBe(policyVersion(policy({ threshold: 15, guardrails: [] })));
  });

  it('ne dépend pas de l’ordre des garde-fous', () => {
    const one = policy({ guardrails: ['incident', 'sensitive-zone'] });
    const other = policy({ guardrails: ['sensitive-zone', 'incident'] });
    expect(policyVersion(one)).toBe(policyVersion(other));
  });
});

describe('defaultVariants et simulateThresholds (SPEC §8)', () => {
  it('propose la règle actuelle, plus tolérante, plus stricte et un garde-fou de plus', () => {
    const variants = defaultVariants();
    const thresholds = variants.map((variant) => variant.threshold);
    expect(thresholds).toEqual([20, 15, 30, 20]);
    const guarded = variants[3];
    const current = variants[0];
    expect(guarded.guardrails.length).toBe(current.guardrails.length + 1);
    expect(variants[2].decision).toBe('review');
  });

  it('rejoue la règle courante une fois par seuil demandé', () => {
    const outcomes = simulateThresholds(demoTickets(), [30, 20, 15]);
    expect(outcomes).toHaveLength(3);
    expect(outcomes[0].variant.delegated).toBe(0);
    expect(outcomes[1].variant.delegated).toBe(40);
    expect(outcomes[2].variant.delegated).toBe(52);
  });
});

describe('simulateCohorts (SPEC §16.4)', () => {
  it('donne l’écart de chaque cohorte', () => {
    const cohorts = simulateCohorts({
      tickets: demoTickets(),
      baseline: policy({ threshold: 20 }),
      variant: policy({ threshold: 15 }),
    });
    expect(cohorts.map((cohort) => cohort.cohortKey)).toEqual(['bugfix/api/M', 'feature/web/L']);
    expect(cohorts[0].delegatedDelta).toBe(0);
    expect(cohorts[1].delegatedDelta).toBe(12);
    expect(cohorts[1].reopeningsAvoided).toBe(3);
  });
});
