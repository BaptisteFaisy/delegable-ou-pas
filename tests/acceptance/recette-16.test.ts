/**
 * Recette 16 (SPEC §22) : « Dans un essai, un tirage non respecté sort le
 * ticket de l'essai. » DP-27 — SPEC §11 : le sort décide, et ce qui n'est pas
 * respecté est exclu, avec un motif.
 */
import { describe, expect, it } from 'vitest';
import { draw, enforceCompliance } from '../../src/domain/trial.js';
import type { Randomness } from '../../src/ports.js';
import { sampleTrial } from '../db/fixtures.js';

/** A draw that always says "agent arm": reproducible, like the real one. */
const AGENT_ALWAYS: Randomness = {
  nextInt: () => 0,
  drawArm: () => 'agent',
};

describe('recette-16 — tirage non respecté dans un essai', () => {
  it('sort le ticket de l’essai, avec un motif', () => {
    const trial = sampleTrial();
    const assignment = draw(trial, 'issue-1', AGENT_ALWAYS);
    expect(assignment.arm).toBe('agent');

    const respected = enforceCompliance(assignment, 'agent');
    expect(respected.complied).toBe(true);
    expect(respected.excludedReason).toBe('');

    const violated = enforceCompliance(assignment, 'human');
    expect(violated.complied).toBe(false);
    expect(violated.excludedReason).toContain('non respecté');
  });
});
