/**
 * Tests of `src/domain/causal.ts` — SPEC §7 rule 5, §11 and §20; DP-09,
 * DP-10, DP-17.
 *
 * Every test is deterministic: no clock, no randomness. The rates are built
 * with `proportion()` so the figures carry their sample size and their
 * interval (SPEC §7 rule 3), and the matching is the one `exactMatch`
 * produces (never a second implementation).
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SELECTION_GAMMA,
  causalReadiness,
  confoundingBound,
  confoundingFactorFor,
  eValue,
  matchingSensitivity,
  rosenbaumBound,
} from '../../src/domain/causal.js';
import type { MatchableTicket } from '../../src/domain/matching.js';
import { proportion } from '../../src/domain/stats.js';

/** A matchable ticket; defaults to a mid-size API bug closed in 10 h. */
function ticket(issueId: string, arm: 'agent' | 'human'): MatchableTicket {
  return { issueId, arm, nature: 'bug', zone: 'api', size: 'M', leadTimeH: 10 };
}

/** Ten tickets on each side, all matching each other on nature × zone × size. */
function arms(count: number): { agent: MatchableTicket[]; human: MatchableTicket[] } {
  const agent: MatchableTicket[] = [];
  const human: MatchableTicket[] = [];
  for (let i = 0; i < count; i += 1) {
    agent.push(ticket(`A${i + 1}`, 'agent'));
    human.push(ticket(`H${i + 1}`, 'human'));
  }
  return { agent, human };
}

/** Clean closure of every ticket: the agent arm closes cleanly, the other does not. */
function allForAgent(count: number): Record<string, boolean> {
  const clean: Record<string, boolean> = {};
  for (let i = 0; i < count; i += 1) {
    clean[`A${i + 1}`] = true;
    clean[`H${i + 1}`] = false;
  }
  return clean;
}

/** Every word a visible sentence must never use to qualify an observed gap. */
const FORBIDDEN = [/\bcaus(e|es|é|ée|é)\b/i, /dû à/gi, /because of/gi];

describe('eValue — the E-value of an observed gap', () => {
  it('gives an E-value above 1 on a computable case: 80 % on 50 against a 70 % null value', () => {
    const observed = proportion(40, 50);
    const value = eValue(observed, 0.7);
    expect(value).toBeGreaterThan(1);
    expect(value).toBeCloseTo(1.5469, 4);
  });

  it('gives exactly 1 on 50 % against a 50 % null value', () => {
    expect(eValue(proportion(25, 50), 0.5)).toBe(1);
  });

  it('gives exactly 1 on a null gap, whatever the sample size', () => {
    expect(eValue(proportion(30, 50), 0.6)).toBe(1);
    expect(eValue(proportion(0, 0), 0)).toBe(1);
  });

  it('reads the same way under the null value: the symmetric case', () => {
    const below = eValue(proportion(30, 50), 0.7);
    const mirrored = eValue(proportion(35, 50), 0.6);
    expect(below).toBeCloseTo(mirrored, 10);
    expect(below).toBeGreaterThan(1);
  });

  it('gives 1 without any ticket: nothing to explain away', () => {
    expect(eValue({ n: 0, rate: 0, ciLow: 0, ciHigh: 1 }, 0.5)).toBe(1);
  });
});

describe('confoundingFactorFor — the unmeasured confounding that breaks the conclusion', () => {
  it('stays at 1 while the gap is not established: nothing has to be explained away', () => {
    expect(confoundingFactorFor(proportion(40, 50), 0.7)).toBe(1);
  });

  it('rises above 1 once the gap is established, and says by how much', () => {
    const factor = confoundingFactorFor(proportion(54, 60), 0.7);
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeCloseTo(1.7251, 3);
  });

  it('is 1 on a null gap', () => {
    expect(confoundingFactorFor(proportion(25, 50), 0.5)).toBe(1);
  });

  it('reports the whole answer in one object, with the E-value and its note', () => {
    const bound = confoundingBound(proportion(40, 50), 0.7);
    expect(bound.eValue).toBeCloseTo(1.5469, 4);
    expect(bound.robust).toBe(false);
    expect(bound.note.fr).toContain('confusion');
    expect(bound.note.en).toContain('confounding');
  });
});

describe('rosenbaumBound — the selection gap a matching tolerates', () => {
  it('computes the bound of a matching built by the exact matching', () => {
    const { agent, human } = arms(10);
    const sensitivity = matchingSensitivity(agent, human, allForAgent(10));
    expect(sensitivity.matchedPairs).toBe(10);
    expect(sensitivity.decisiveForAgent).toBe(10);
    expect(sensitivity.decisiveForHuman).toBe(0);
    expect(sensitivity.netDifference).toBe(10);
    expect(sensitivity.bound.bound).toBeCloseTo(1.383, 3);
  });

  it('holds with a tolerated selection gap of 1.2 and stops holding beyond the bound', () => {
    const held = rosenbaumBound(10, 10, DEFAULT_SELECTION_GAMMA);
    expect(held.robust).toBe(true);
    expect(held.gamma).toBe(1.2);
    const broken = rosenbaumBound(10, 10, 2);
    expect(broken.robust).toBe(false);
    expect(broken.bound).toBeCloseTo(held.bound, 10);
  });

  it('does not hold without a single matched pair', () => {
    const bound = rosenbaumBound(0, 0, 1.2);
    expect(bound.robust).toBe(false);
    expect(bound.bound).toBe(1);
    expect(bound.note.fr.length).toBeGreaterThan(10);
  });

  it('refuses figures that do not add up instead of guessing', () => {
    const bound = rosenbaumBound(10, 7, 1.2);
    expect(bound.robust).toBe(false);
    expect(bound.bound).toBe(1);
  });
});

describe('causalReadiness — the observation is never a causal answer', () => {
  it('always answers that the observation is not causal, and explains why', () => {
    const readiness = causalReadiness({ n: 41, randomised: false, confoundersKnown: [] });
    expect(readiness.causal).toBe(false);
    expect(readiness.reason.fr.length).toBeGreaterThan(10);
    expect(readiness.reason.en.length).toBeGreaterThan(10);
    expect(readiness.reason.fr).toContain('tirés au sort');
    expect(readiness.reason.en).toContain('drawn at random');
  });

  it('says the cohort is too thin below twenty tickets and usable above', () => {
    expect(causalReadiness({ n: 12, randomised: false, confoundersKnown: [] }).usable).toBe(false);
    expect(causalReadiness({ n: 41, randomised: false, confoundersKnown: [] }).usable).toBe(true);
  });

  it('names the controlled trial when the two arms were drawn at random', () => {
    const readiness = causalReadiness({ n: 41, randomised: true, confoundersKnown: ['season'] });
    expect(readiness.causal).toBe(false);
    expect(readiness.reason.fr).toContain('essai contrôlé');
    expect(readiness.reason.en).toContain('controlled trial');
  });
});

describe('the module never qualifies an observed gap with a causal word', () => {
  it('keeps every visible sentence free of them', () => {
    const sentences: string[] = [];
    sentences.push(confoundingBound(proportion(40, 50), 0.7).note.fr);
    sentences.push(confoundingBound(proportion(40, 50), 0.7).note.en);
    sentences.push(rosenbaumBound(10, 10, 1.2).note.fr);
    sentences.push(rosenbaumBound(10, 10, 1.2).note.en);
    const { agent, human } = arms(4);
    const sensitivity = matchingSensitivity(agent, human, allForAgent(4));
    sentences.push(sensitivity.note.fr, sensitivity.note.en);
    const readiness = causalReadiness({ n: 41, randomised: false, confoundersKnown: [] });
    sentences.push(readiness.reason.fr, readiness.reason.en);
    for (const sentence of sentences) {
      for (const forbidden of FORBIDDEN) expect(sentence).not.toMatch(forbidden);
    }
  });
});
