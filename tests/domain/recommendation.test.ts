/**
 * Tests of the recommendation (SPEC §8, recipes 8 and 9; DP-11, DP-12).
 */
import { describe, expect, it } from 'vitest';
import type { ProportionStat } from '../../src/types.js';
import type { ProjectSettings, RecommendationCard } from '../../src/types-advice.js';
import {
  conditionsFor,
  confidenceOf,
  createRecommendationEngine,
  guardrails,
  recommendFrom,
  type RecommendationDeps,
} from '../../src/domain/recommendation.js';

/** A proportion with a controlled sample size and interval width. */
function ps(n: number, rate: number, width: number): ProportionStat {
  const half = width / 2;
  return { n, rate, ciLow: Math.max(0, rate - half), ciHigh: Math.min(1, rate + half) };
}

function projectSettings(over: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    projectId: 'p',
    projectKey: 'PK',
    minArmSize: 20,
    adoptionDate: '',
    natures: ['bugfix'],
    zones: ['api'],
    sizes: ['S'],
    sensitiveZones: [],
    hardenedReview: { label: 'l', minReviewers: 2, zoneOwnerRequired: false, evidencePerCriterion: false },
    waitingStatuses: [],
    demo: false,
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeCard(value: RecommendationCard['value'] = 'delegate'): RecommendationCard {
  return {
    issueId: 'i1',
    issueKey: 'PK-1',
    value,
    cohort: { level: 'nature', nature: 'bugfix', zone: null, size: null },
    epochId: 'e1',
    agent: ps(40, 0.8, 0.1),
    human: ps(38, 0.5, 0.1),
    agentLeadTime: null,
    humanLeadTime: null,
    conclusion: 'better',
    balance: { balanced: true, signals: [] },
    confidence: 'high',
    reasons: [],
    conditions: [],
    guardrails: [],
    referenceIssueKeys: [],
    failureCauses: [],
    demo: false,
    computedAt: '2026-01-02T00:00:00Z',
  };
}

describe('guardrails', () => {
  it('recette-09 : signale l’incident ouvert et la zone sensible', () => {
    expect(guardrails(true, 'api', ['api', 'pay'], true)).toEqual([
      'open-incident',
      'sensitive-zone',
    ]);
  });

  it('signale les critères d’acceptation absents, lui seul', () => {
    expect(guardrails(false, 'web', [], false)).toEqual(['missing-acceptance-criteria']);
  });

  it('reste vide quand rien ne s’oppose', () => {
    expect(guardrails(false, 'web', [], true)).toEqual([]);
  });
});

describe('recommendFrom', () => {
  const balanced = { balanced: true, signals: [] };
  const unbalanced = { balanced: false, signals: [] };

  it('clôture meilleure et délai meilleur → delegate', () => {
    expect(recommendFrom('better', balanced, [], true)).toBe('delegate');
  });

  it('clôture meilleure, délai non meilleur → delegate', () => {
    expect(recommendFrom('better', balanced, [], false)).toBe('delegate');
  });

  it('délai meilleur mais clôture non établie → delegate-with-review', () => {
    expect(recommendFrom('same', balanced, [], true)).toBe('delegate-with-review');
  });

  it('clôture équivalente, délai non meilleur → delegate', () => {
    expect(recommendFrom('same', balanced, [], false)).toBe('delegate');
  });

  it('clôture nettement plus basse, écart établi → keep-human', () => {
    expect(recommendFrom('worse', balanced, [], false)).toBe('keep-human');
  });

  it('pas assez de recul → not-enough-data', () => {
    expect(recommendFrom('not-enough-data', balanced, [], true)).toBe('not-enough-data');
  });

  it('bras déséquilibrés → not-enough-data', () => {
    expect(recommendFrom('better', unbalanced, [], true)).toBe('not-enough-data');
  });

  it('recette-09 : un garde-fou interdit delegate, au mieux delegate-with-review', () => {
    expect(recommendFrom('better', balanced, ['open-incident'], true)).toBe('delegate-with-review');
  });
});

describe('confidenceOf', () => {
  it('recette-08 : échantillon large et fourchette étroite → haute', () => {
    expect(confidenceOf(ps(50, 0.9, 0.1), ps(45, 0.88, 0.12), 'better')).toBe('high');
  });

  it('échantillon moyen → moyenne', () => {
    expect(confidenceOf(ps(25, 0.8, 0.3), ps(25, 0.5, 0.3), 'better')).toBe('medium');
  });

  it('échantillon trop mince → faible', () => {
    expect(confidenceOf(ps(15, 0.8, 0.1), ps(15, 0.5, 0.1), 'better')).toBe('low');
  });

  it('pas assez de recul → toujours faible', () => {
    expect(confidenceOf(ps(100, 0.8, 0.05), ps(100, 0.5, 0.05), 'not-enough-data')).toBe('low');
  });
});

describe('conditionsFor', () => {
  it('exige la relecture renforcée du projet pour delegate-with-review', () => {
    const settings = projectSettings({
      hardenedReview: { label: 'l', minReviewers: 2, zoneOwnerRequired: true, evidencePerCriterion: true },
    });
    expect(conditionsFor('delegate-with-review', settings).length).toBe(3);
  });

  it('ne pose aucune condition aux autres recommandations', () => {
    expect(conditionsFor('delegate', projectSettings())).toEqual([]);
  });
});

describe('createRecommendationEngine', () => {
  it('recette-08 : read et compute lisent la même carte mise en cache', async () => {
    const card = makeCard('delegate');
    const deps: RecommendationDeps = {
      recommendations: { get: async () => card, save: async () => {}, listByProject: async () => [] },
    } as unknown as RecommendationDeps;
    const engine = createRecommendationEngine(deps);
    await expect(engine.read('i1')).resolves.toBe(card);
    await expect(engine.compute('i1')).resolves.toBe(card);
  });
});