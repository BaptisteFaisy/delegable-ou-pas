/**
 * Tests of the trial power (SPEC §11 "L'essai contrôlé", DP-27).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ALPHA,
  DEFAULT_POWER,
  DEFAULT_TRIAL_WEEKS,
  achievedPower,
  detectableEffect,
  normalCdf,
  normalQuantile,
  sampleSizePerArm,
  trialPlan,
} from '../../src/domain/power.js';

/** Tolerance of the specification on a quantile. */
const QUANTILE_TOLERANCE = 1e-4;

/** The imposed case: baseline 0.85, effect of 10 points. */
const IMPOSED_SIZE = sampleSizePerArm(0.85, 0.10);

describe('normalQuantile — the inverse of the normal law, no dependency', () => {
  it('matches the known values within 1e-4', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4);
    expect(normalQuantile(0.95)).toBeCloseTo(1.644854, 4);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 4);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959964, 4);
    expect(normalQuantile(0.9)).toBeCloseTo(1.281552, 4);
    expect(normalQuantile(0.99)).toBeCloseTo(2.326348, 4);
  });

  it('respects the tolerance demanded by the lot, 1e-4', () => {
    expect(Math.abs(normalQuantile(0.975) - 1.959964)).toBeLessThan(QUANTILE_TOLERANCE);
    expect(Math.abs(normalQuantile(0.025) + 1.959964)).toBeLessThan(QUANTILE_TOLERANCE);
  });

  it('is the inverse of the cdf', () => {
    expect(normalCdf(normalQuantile(0.975))).toBeCloseTo(0.975, 8);
    expect(normalCdf(normalQuantile(0.2))).toBeCloseTo(0.2, 8);
  });

  it('is symmetric', () => {
    expect(normalQuantile(0.025)).toBeCloseTo(-normalQuantile(0.975), 10);
  });

  it('never answers a silent NaN outside (0, 1)', () => {
    expect(normalQuantile(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(normalQuantile(-0.5)).toBe(Number.NEGATIVE_INFINITY);
    expect(normalQuantile(1)).toBe(Number.POSITIVE_INFINITY);
    expect(normalQuantile(2)).toBe(Number.POSITIVE_INFINITY);
    expect(() => normalQuantile(Number.NaN)).toThrow(RangeError);
  });
});

describe('normalCdf — the tail keeps its digits', () => {
  it('matches the known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 10);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 6);
  });

  it('does not collapse to 1 on a high boundary', () => {
    expect(normalCdf(4.3826)).toBeLessThan(1);
    expect(1 - normalCdf(4.3826)).toBeGreaterThan(1e-7);
    expect(1 - normalCdf(4.3826)).toBeLessThan(2e-5);
  });
});

describe('sampleSizePerArm — the size computed before the trial', () => {
  it('gives about 190 per arm for a baseline of 0.85 and 10 points', () => {
    expect(Number.isInteger(IMPOSED_SIZE)).toBe(true);
    expect(IMPOSED_SIZE).toBeGreaterThanOrEqual(190 * 0.9);
    expect(IMPOSED_SIZE).toBeLessThanOrEqual(190 * 1.1);
  });

  it('needs more tickets for a smaller effect', () => {
    expect(sampleSizePerArm(0.85, 0.05)).toBeGreaterThan(sampleSizePerArm(0.85, 0.10));
    expect(sampleSizePerArm(0.6, 0.20)).toBeLessThan(sampleSizePerArm(0.6, 0.10));
  });

  it('answers a defined value on the edges, never a NaN', () => {
    expect(sampleSizePerArm(0.85, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(sampleSizePerArm(0.85, -0.1)).toBe(Number.POSITIVE_INFINITY);
    expect(sampleSizePerArm(0.95, 0.10)).toBe(Number.POSITIVE_INFINITY);
    expect(sampleSizePerArm(1.5, 0.10)).toBe(0);
    expect(sampleSizePerArm(Number.NaN, 0.10)).toBe(0);
  });
});

describe('achievedPower — the power really reached', () => {
  it('is the inverse of the sample size', () => {
    expect(achievedPower(IMPOSED_SIZE, 0.85, 0.10)).toBeCloseTo(DEFAULT_POWER, 2);
    expect(achievedPower(sampleSizePerArm(0.6, 0.08), 0.6, 0.08)).toBeCloseTo(DEFAULT_POWER, 2);
  });

  it('grows with the number of tickets and never exceeds 1', () => {
    expect(achievedPower(400, 0.85, 0.10)).toBeGreaterThan(achievedPower(200, 0.85, 0.10));
    expect(achievedPower(100000, 0.85, 0.10)).toBeLessThanOrEqual(1);
    expect(achievedPower(0, 0.85, 0.10)).toBe(0);
    expect(achievedPower(-5, 0.85, 0.10)).toBe(0);
  });

  it('stays above alpha when the effect is nil', () => {
    expect(achievedPower(200, 0.85, 0, DEFAULT_ALPHA)).toBeGreaterThan(DEFAULT_ALPHA * 0.9);
  });
});

describe('detectableEffect — the smallest effect a size can see', () => {
  it('inverts the sample size', () => {
    expect(detectableEffect(IMPOSED_SIZE, 0.85)).toBeCloseTo(0.10, 2);
  });

  it('shrinks when the trial gets bigger', () => {
    expect(detectableEffect(400, 0.85)).toBeLessThan(detectableEffect(200, 0.85));
  });

  it('caps on the largest possible effect when the trial is too small', () => {
    expect(detectableEffect(10, 0.85)).toBeCloseTo(0.15, 10);
    expect(achievedPower(10, 0.85, 0.15)).toBeLessThan(DEFAULT_POWER);
  });
});

describe('trialPlan — feasibility, the honest answer', () => {
  it('says "not feasible" for 5 tickets a week and 5 points of effect', () => {
    const plan = trialPlan({ baselineRate: 0.85, ticketsPerWeek: 5, mde: 0.05 });
    expect(plan.feasible).toBe(false);
    expect(plan.nPerArm).toBeGreaterThan(500);
    expect(plan.weeksNeeded).not.toBeNull();
    expect(plan.weeksNeeded ?? 0).toBeGreaterThan(DEFAULT_TRIAL_WEEKS);
  });

  it('says "feasible" for 40 tickets a week, with a coherent duration', () => {
    const plan = trialPlan({ baselineRate: 0.85, ticketsPerWeek: 40, mde: 0.05 });
    expect(plan.feasible).toBe(true);
    expect(plan.weeksNeeded).toBe(Math.ceil((2 * plan.nPerArm) / 40));
    expect(plan.weeksNeeded ?? 0).toBeLessThanOrEqual(DEFAULT_TRIAL_WEEKS);
    expect(plan.power).toBeCloseTo(DEFAULT_POWER, 2);
    expect(plan.detectableEffect).toBeLessThanOrEqual(0.05);
  });

  it('keeps the plan honest without a minimum detectable effect', () => {
    const plan = trialPlan({ baselineRate: 0.85, ticketsPerWeek: 40 });
    expect(plan.nPerArm).toBe(Math.floor((40 * DEFAULT_TRIAL_WEEKS) / 2));
    expect(plan.feasible).toBe(true);
    expect(plan.detectableEffect).toBeGreaterThan(0);
    expect(plan.power).toBeCloseTo(DEFAULT_POWER, 2);
  });

  it('never invents a duration when no ticket flows', () => {
    const plan = trialPlan({ baselineRate: 0.85, ticketsPerWeek: 0, mde: 0.05 });
    expect(plan.feasible).toBe(false);
    expect(plan.weeksNeeded).toBeNull();
  });

  it('honours the window given by the team', () => {
    const tight = trialPlan({ baselineRate: 0.85, ticketsPerWeek: 40, mde: 0.05, weeks: 4 });
    expect(tight.feasible).toBe(false);
    const wide = trialPlan({ baselineRate: 0.85, ticketsPerWeek: 40, mde: 0.05, weeks: 104 });
    expect(wide.feasible).toBe(true);
  });
});

describe('the domain stays pure', () => {
  const sources = ['../../src/domain/power.ts', '../../src/domain/sequential.ts'].map(
    (path) => readFileSync(new URL(path, import.meta.url), 'utf8'),
  );

  it('imports no Forge module, reads no clock, draws no lottery', () => {
    for (const source of sources) {
      expect(source).not.toMatch(/from ['"]@forge\//);
      expect(source).not.toMatch(/require\(['"]@forge\//);
      expect(source).not.toMatch(/Date\s*\.\s*now/);
      expect(source).not.toMatch(/Math\s*\.\s*random/);
    }
  });
});
