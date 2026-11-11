/**
 * Tests of the recorded decision (SPEC §8 "Un avis, pas un ordre"; DP-13).
 */
import { describe, expect, it } from 'vitest';
import type { RecommendationCard } from '../../src/types-advice.js';
import { followed, recordDecision } from '../../src/domain/decision.js';

function makeCard(value: RecommendationCard['value']): RecommendationCard {
  return {
    issueId: 'i1',
    issueKey: 'PK-1',
    value,
    cohort: { level: 'nature', nature: 'bugfix', zone: null, size: null },
    epochId: 'e1',
    agent: null,
    human: null,
    agentLeadTime: null,
    humanLeadTime: null,
    conclusion: 'not-enough-data',
    balance: { balanced: true, signals: [] },
    confidence: 'low',
    reasons: [],
    conditions: [],
    guardrails: [],
    referenceIssueKeys: [],
    failureCauses: [],
    demo: false,
    computedAt: '2026-01-02T00:00:00Z',
  };
}

describe('followed', () => {
  it('delegate suit delegate et delegate-with-review', () => {
    expect(followed(makeCard('delegate'), 'delegate')).toBe(true);
    expect(followed(makeCard('delegate-with-review'), 'delegate')).toBe(true);
  });

  it('keep-human suit keep-human et not-enough-data', () => {
    expect(followed(makeCard('keep-human'), 'keep-human')).toBe(true);
    expect(followed(makeCard('not-enough-data'), 'keep-human')).toBe(true);
  });

  it('un avis contraire n’est pas suivi', () => {
    expect(followed(makeCard('keep-human'), 'delegate')).toBe(false);
    expect(followed(makeCard('delegate'), 'keep-human')).toBe(false);
  });

  it('une carte absente n’est jamais suivie', () => {
    expect(followed(null, 'delegate')).toBe(false);
    expect(followed(null, 'keep-human')).toBe(false);
  });
});

describe('recordDecision', () => {
  it('enregistre la décision et son suivi', () => {
    const decision = recordDecision('i1', 'delegate', 'avance vite', makeCard('delegate'), 'autonomous', '2026-01-03T00:00:00Z');
    expect(decision).toEqual({
      issueId: 'i1',
      taken: 'delegate',
      followed: true,
      actualLevel: 'autonomous',
      reason: 'avance vite',
      at: '2026-01-03T00:00:00Z',
    });
  });

  it('conserve la décision même sans carte affichée (données absentes = normales)', () => {
    const decision = recordDecision('i2', 'keep-human', 'non suivi', null, 'none', '2026-01-04T00:00:00Z');
    expect(decision.followed).toBe(false);
    expect(decision.taken).toBe('keep-human');
    expect(decision.issueId).toBe('i2');
  });
});