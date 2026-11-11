/**
 * Tests of the controlled trial (SPEC §11, recipe 16; DP-27).
 */
import { describe, expect, it } from 'vitest';
import type { Trial } from '../../src/types-advice.js';
import type { Randomness } from '../../src/ports.js';
import {
  draw,
  enforceCompliance,
  isEligible,
  stopReason,
} from '../../src/domain/trial.js';

function trial(over: Partial<Trial> = {}): Trial {
  return {
    id: 't1',
    projectId: 'p',
    cohort: { level: 'nature', nature: 'bugfix', zone: null, size: null },
    epochId: 'e1',
    seed: 'seed-1',
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2026-02-01T00:00:00Z',
    state: 'running',
    stopReason: '',
    ...over,
  };
}

/** Deterministic randomness, derived from strings, never `Math.random()`. */
function intSeed(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) % 1000003;
  return h;
}

function fakeRandomness(): Randomness {
  return {
    nextInt: (seed, max) => intSeed(seed) % max,
    drawArm: (seed, issueId) => (intSeed(`${seed}:${issueId}`) % 2 === 0 ? 'agent' : 'human'),
  };
}

describe('isEligible', () => {
  it('admet un ticket prêt, non urgent, hors zone sensible', () => {
    expect(isEligible(true, 'api', ['pay'], false)).toBe(true);
  });

  it('refuse sans critères d’acceptation, urgent, ou en zone sensible', () => {
    expect(isEligible(false, 'api', [], false)).toBe(false);
    expect(isEligible(true, 'api', [], true)).toBe(false);
    expect(isEligible(true, 'pay', ['pay'], false)).toBe(false);
  });
});

describe('draw', () => {
  it('recette-16 : tirage reproductible, rejouable, jamais Math.random()', () => {
    const randomness = fakeRandomness();
    const first = draw(trial(), 'issue-1', randomness);
    const second = draw(trial(), 'issue-1', randomness);
    expect(first.arm).toBe(second.arm);
    expect(first.complied).toBe(true);
    expect(first.excludedReason).toBe('');
  });
});

describe('enforceCompliance', () => {
  it('recette-16 : le bras tiré respecté reste dans l’essai', () => {
    const assignment = draw(trial(), 'issue-1', fakeRandomness());
    expect(enforceCompliance(assignment, assignment.arm).excludedReason).toBe('');
    expect(enforceCompliance(assignment, assignment.arm).complied).toBe(true);
  });

  it('recette-16 : le tirage non respecté sort l’essai avec un motif', () => {
    const randomness = fakeRandomness();
    const assignment = draw(trial(), 'issue-1', randomness);
    const other: 'agent' | 'human' = assignment.arm === 'agent' ? 'human' : 'agent';
    const enforced = enforceCompliance(assignment, other);
    expect(enforced.complied).toBe(false);
    expect(enforced.excludedReason).toContain('non respecté');
  });
});

describe('stopReason', () => {
  it('s’arrête quand l’écart est établi', () => {
    const reason = stopReason(trial(), '2026-01-15T00:00:00Z', true, { agent: 0, human: 0 });
    expect(reason).toBe('écart établi');
  });

  it('s’arrête quand la durée prévue est atteinte', () => {
    const reason = stopReason(trial(), '2026-02-02T00:00:00Z', false, { agent: 0, human: 0 });
    expect(reason).toBe('durée prévue atteinte');
  });

  it('s’arrête quand un bras accumule les réouvertures (sécurité)', () => {
    const reason = stopReason(trial(), '2026-01-15T00:00:00Z', false, { agent: 3, human: 0 });
    expect(reason).toContain('réouvertures excessives');
  });

  it('chaîne vide : l’essai continue', () => {
    expect(stopReason(trial(), '2026-01-15T00:00:00Z', false, { agent: 0, human: 0 })).toBe('');
  });
});