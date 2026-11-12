/**
 * Tests of `src/domain/matching.ts` — SPEC §7 rule 5 (idea 5: matching), DP-17.
 *
 * Every test is deterministic: no clock, no randomness, ties broken by
 * `issueId`. The DP-17 guard at the bottom reuses `privacy.ts` (zero
 * duplication) and scans the rendered keys of every matching output.
 */
import { describe, expect, it } from 'vitest';

import {
  BALANCE_SMD_THRESHOLD,
  DEFAULT_CALIPER,
  DEFAULT_EXACT_KEYS,
  balanceBeforeAfter,
  exactMatch,
  featureValue,
  nearestNeighbourMatch,
  propensityScore,
  type MatchableTicket,
  type PropensityWeight,
} from '../../src/domain/matching.js';
import { PERSON_IDENTIFIER_FIELDS, personIdentifierLeak } from '../../src/domain/privacy.js';

/** Builds a matchable ticket; defaults are a mid-size API bug closed in 10 h. */
function ticket(
  issueId: string,
  arm: 'agent' | 'human',
  overrides: Partial<Omit<MatchableTicket, 'issueId' | 'arm'>> = {},
): MatchableTicket {
  return { issueId, arm, nature: 'bug', zone: 'api', size: 'M', leadTimeH: 10, ...overrides };
}

/** Propensity weights mapping the lead time onto a small comparable scale. */
const PERCENT_SCALE: readonly PropensityWeight[] = [
  { feature: 'leadTimeH', value: (t) => (t.leadTimeH ?? 0) / 100, weight: 1 },
];

describe('exactMatch — nature × zone × size', () => {
  it('pairs tickets sharing the same key and reports what is left', () => {
    const agent = [ticket('A1', 'agent'), ticket('A2', 'agent'), ticket('A3', 'agent', { nature: 'feat', zone: 'ui', size: 'S' })];
    const human = [ticket('H1', 'human'), ticket('H3', 'human', { nature: 'feat', zone: 'ui', size: 'S' })];
    const result = exactMatch(agent, human);
    expect(result.pairs.map((p) => [p[0].issueId, p[1].issueId])).toEqual([
      ['A1', 'H1'],
      ['A3', 'H3'],
    ]);
    expect(result.unmatchedAgent.map((t) => t.issueId)).toEqual(['A2']);
    expect(result.unmatchedHuman).toEqual([]);
    expect(result.matchedShare).toBeCloseTo(4 / 5, 10); // 4 matched of 5 offered
    expect(result.keys).toEqual([...DEFAULT_EXACT_KEYS]);
  });

  it('matches without replacement: two agents, one human, one pair only', () => {
    const result = exactMatch(
      [ticket('A1', 'agent'), ticket('A2', 'agent')],
      [ticket('H1', 'human')],
    );
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0][0].issueId).toBe('A1');
    expect(result.unmatchedAgent.map((t) => t.issueId)).toEqual(['A2']);
  });

  it('is deterministic: input order does not change the result', () => {
    const agent = [ticket('A2', 'agent'), ticket('A1', 'agent')];
    const human = [ticket('H2', 'human'), ticket('H1', 'human')];
    const direct = exactMatch(agent, human);
    const shuffled = exactMatch([...agent].reverse(), [...human].reverse());
    expect(direct.pairs.map((p) => [p[0].issueId, p[1].issueId])).toEqual(
      shuffled.pairs.map((p) => [p[0].issueId, p[1].issueId]),
    );
    expect(direct.pairs[0][1].issueId).toBe('H1'); // smallest issueId wins the tie
  });

  it('honours custom keys: matching on nature alone ignores zone and size', () => {
    const result = exactMatch(
      [ticket('A1', 'agent', { zone: 'api', size: 'M' })],
      [ticket('H1', 'human', { zone: 'ui', size: 'S' })],
      ['nature'],
    );
    expect(result.pairs).toHaveLength(1);
    expect(result.keys).toEqual(['nature']);
  });

  it('answers empty lists with an empty result, not a guess', () => {
    const result = exactMatch([], []);
    expect(result.pairs).toEqual([]);
    expect(result.unmatchedAgent).toEqual([]);
    expect(result.unmatchedHuman).toEqual([]);
    expect(result.matchedShare).toBe(0);
  });

  it('reports a low matched share when most tickets are discarded', () => {
    const agent = Array.from({ length: 10 }, (_, i) => ticket(`A${i + 1}`, 'agent'));
    const result = exactMatch(agent, [ticket('H1', 'human')]);
    expect(result.pairs).toHaveLength(1);
    expect(result.unmatchedAgent).toHaveLength(9);
    expect(result.matchedShare).toBeCloseTo(2 / 11, 10);
  });

  it('reads an unknown feature as absent, never as a crash', () => {
    expect(featureValue(ticket('A1', 'agent'), 'assignee')).toBeNull();
    expect(featureValue(ticket('A1', 'agent'), 'size')).toBe('M');
  });
});

describe('propensityScore', () => {
  it('is the weighted sum of the feature values', () => {
    const weights: readonly PropensityWeight[] = [
      { feature: 'a', value: () => 2, weight: 3 },
      { feature: 'b', value: () => 5, weight: -1 },
    ];
    expect(propensityScore(ticket('A1', 'agent'), weights)).toBe(1);
  });

  it('is 0 without weights', () => {
    expect(propensityScore(ticket('A1', 'agent'), [])).toBe(0);
  });

  it('falls back to the default weights: scaled lead time, absent read at mid-scale', () => {
    // 24 h maps to 0.5 and an absent lead time also reads 0.5: distance 0.
    const near = nearestNeighbourMatch(
      [ticket('A1', 'agent', { leadTimeH: 24 })],
      [ticket('H1', 'human', { leadTimeH: null })],
      {},
    );
    expect(near.keys).toEqual(['leadTimeH']);
    expect(near.pairs).toHaveLength(1);
    // 200 h maps to ~0.89 against 0.5: past the default caliper, no pair.
    const far = nearestNeighbourMatch(
      [ticket('A1', 'agent', { leadTimeH: 200 })],
      [ticket('H1', 'human', { leadTimeH: 24 })],
      {},
    );
    expect(far.pairs).toHaveLength(0);
  });
});

describe('nearestNeighbourMatch — propensity score fallback', () => {
  it('pairs tickets inside the caliper and leaves the others', () => {
    const result = nearestNeighbourMatch(
      [ticket('A1', 'agent', { leadTimeH: 10 }), ticket('A2', 'agent', { leadTimeH: 90 })],
      [ticket('H1', 'human', { leadTimeH: 20 })],
      { weights: PERCENT_SCALE },
    );
    expect(result.pairs.map((p) => [p[0].issueId, p[1].issueId])).toEqual([['A1', 'H1']]);
    expect(result.unmatchedAgent.map((t) => t.issueId)).toEqual(['A2']);
    expect(result.unmatchedHuman).toEqual([]);
    expect(result.keys).toEqual(['leadTimeH']);
  });

  it('respects the default caliper of 0.2 on the given scale', () => {
    expect(DEFAULT_CALIPER).toBe(0.2);
    const near = nearestNeighbourMatch(
      [ticket('A1', 'agent', { leadTimeH: 10 })],
      [ticket('H1', 'human', { leadTimeH: 30 })], // distance 0.20 = caliper, accepted
      { weights: PERCENT_SCALE },
    );
    expect(near.pairs).toHaveLength(1);
    const far = nearestNeighbourMatch(
      [ticket('A1', 'agent', { leadTimeH: 10 })],
      [ticket('H1', 'human', { leadTimeH: 31 })], // distance 0.21 > caliper
      { weights: PERCENT_SCALE },
    );
    expect(far.pairs).toHaveLength(0);
    expect(far.unmatchedAgent).toHaveLength(1);
    expect(far.unmatchedHuman).toHaveLength(1);
  });

  it('matches without replacement: two agents, one human, one pair', () => {
    const result = nearestNeighbourMatch(
      [ticket('A1', 'agent', { leadTimeH: 10 }), ticket('A2', 'agent', { leadTimeH: 11 })],
      [ticket('H1', 'human', { leadTimeH: 10 })],
      { weights: PERCENT_SCALE },
    );
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0][0].issueId).toBe('A1');
    expect(result.unmatchedAgent.map((t) => t.issueId)).toEqual(['A2']);
  });

  it('breaks distance ties by the smallest human issueId', () => {
    const result = nearestNeighbourMatch(
      [ticket('A1', 'agent', { leadTimeH: 10 })],
      [ticket('H2', 'human', { leadTimeH: 10 }), ticket('H1', 'human', { leadTimeH: 10 })],
      { weights: PERCENT_SCALE },
    );
    expect(result.pairs[0][1].issueId).toBe('H1');
  });

  it('honours a custom caliper', () => {
    const result = nearestNeighbourMatch(
      [ticket('A1', 'agent', { leadTimeH: 10 })],
      [ticket('H1', 'human', { leadTimeH: 20 })],
      { caliper: 0.05, weights: PERCENT_SCALE },
    );
    expect(result.pairs).toHaveLength(0);
  });
});

describe('balanceBeforeAfter — standardised difference per criterion', () => {
  it('shows an unbalanced arm before and a balanced matched set after', () => {
    const agent = ['G1', 'G2', 'G3', 'G4'].map((id) => ticket(id, 'agent'));
    const human = [
      ...['H1', 'H2', 'H3', 'H4'].map((id) => ticket(id, 'human')),
      ...['H5', 'H6', 'H7', 'H8'].map((id) => ticket(id, 'human', { size: 'S' })),
    ];
    const matched = exactMatch(agent, human);
    expect(matched.pairs).toHaveLength(4);
    const report = balanceBeforeAfter(agent, human, matched);
    const sizeS = report.criteria.find((c) => c.name === 'size:S');
    expect(sizeS).toBeDefined();
    // Before: the agent arm has no S at all against half of the human arm.
    expect(Math.abs(sizeS!.before)).toBeGreaterThan(1);
    // After: only M-M pairs remain, so every criterion is flat.
    expect(sizeS!.after).toBe(0);
    expect(sizeS!.ok).toBe(true);
    expect(report.balanced).toBe(true);
    for (const criterion of report.criteria) {
      expect(Math.abs(criterion.after)).toBeLessThan(BALANCE_SMD_THRESHOLD);
    }
  });

  it('refuses to call balanced a constant but different gap (+∞, not a guess)', () => {
    const agent = [ticket('G1', 'agent', { leadTimeH: 2 }), ticket('G2', 'agent', { leadTimeH: 2 })];
    const human = [ticket('H1', 'human', { leadTimeH: 50 }), ticket('H2', 'human', { leadTimeH: 50 })];
    const matched = exactMatch(agent, human);
    expect(matched.pairs).toHaveLength(2); // same nature × zone × size
    const report = balanceBeforeAfter(agent, human, matched);
    const lead = report.criteria.find((c) => c.name === 'leadTimeH');
    expect(lead!.after).toBe(Number.POSITIVE_INFINITY);
    expect(lead!.ok).toBe(false);
    expect(report.balanced).toBe(false);
  });

  it('drops absent lead times instead of reading them as zero', () => {
    const agent = [ticket('G1', 'agent', { leadTimeH: null }), ticket('G2', 'agent', { leadTimeH: null })];
    const human = [ticket('H1', 'human'), ticket('H2', 'human')];
    const matched = exactMatch(agent, human);
    const report = balanceBeforeAfter(agent, human, matched);
    const lead = report.criteria.find((c) => c.name === 'leadTimeH');
    // One side has no measurable lead time: no difference is invented.
    expect(lead!.before).toBe(0);
    expect(lead!.after).toBe(0);
  });

  it('answers empty arms with a flat report: no invented criterion, nothing unbalanced', () => {
    const report = balanceBeforeAfter([], [], exactMatch([], []));
    // Only the always-on lead-time criterion remains, flat at 0; no category
    // indicator is invented out of thin air.
    expect(report.criteria.map((c) => c.name)).toEqual(['leadTimeH']);
    expect(report.criteria[0].before).toBe(0);
    expect(report.criteria[0].after).toBe(0);
    expect(report.balanced).toBe(true);
  });
});

describe('DP-17 — no person identifier anywhere in the outputs', () => {
  it('renders matching keys that are cohort coordinates, never people', () => {
    const forbidden = new Set(PERSON_IDENTIFIER_FIELDS.map((f) => f.toLowerCase()));
    const results = [
      exactMatch([ticket('A1', 'agent')], [ticket('H1', 'human')]),
      nearestNeighbourMatch([ticket('A1', 'agent')], [ticket('H1', 'human')], {}),
    ];
    for (const result of results) {
      for (const key of result.keys) {
        const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        expect(forbidden.has(normalized)).toBe(false);
      }
      // The whole rendered structure is scannable by the shared privacy guard.
      expect(personIdentifierLeak(result)).toBeNull();
    }
  });

  it('keeps tickets themselves free of person fields', () => {
    const result = exactMatch(
      [ticket('A1', 'agent'), ticket('A2', 'agent', { nature: 'feat' })],
      [ticket('H1', 'human'), ticket('H2', 'human', { nature: 'feat' })],
    );
    for (const pair of result.pairs) {
      expect(personIdentifierLeak(pair[0])).toBeNull();
      expect(personIdentifierLeak(pair[1])).toBeNull();
    }
    expect(personIdentifierLeak(balanceBeforeAfter(
      result.pairs.map((p) => p[0]),
      result.pairs.map((p) => p[1]),
      result,
    ))).toBeNull();
  });
});
