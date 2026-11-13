/**
 * Tests of the orchestration coordinator.
 *
 * The point of the module: the night queue must apply the specification's rules
 * one by one, and every ticket left behind must say **why** — a silent skip is
 * the worst thing a queue can do. The morning report must then say what was
 * proven, what was reopened, and what stayed behind, with the clean-close rate
 * as a proportion (sample size and interval included).
 */
import { describe, expect, it } from 'vitest';
import {
  morningReport,
  rejectionReason,
  selectForNight,
} from '../../src/domain/coordinator.js';
import type { NightCandidate, SkipReason } from '../../src/domain/coordinator.js';

function candidate(overrides: Partial<NightCandidate> = {}): NightCandidate {
  return {
    issueKey: 'PROJ-412',
    cohortKey: 'data-migration|billing|M',
    recommendation: 'delegate-with-review',
    ready: true,
    urgent: false,
    sensitive: false,
    hasCriteria: true,
    reviewable: true,
    collision: false,
    estimateMinutes: 10,
    ...overrides,
  };
}

describe('file de nuit', () => {
  it('prend un ticket éligible', () => {
    const plan = selectForNight([candidate()], 60);
    expect(plan.taken).toEqual(['PROJ-412']);
    expect(plan.skipped).toEqual([]);
  });

  it('écarte pour chaque motif, et nomme le motif', () => {
    const cases: readonly [NightCandidate, SkipReason][] = [
      [candidate({ ready: false }), 'not-ready'],
      [candidate({ urgent: true }), 'urgent'],
      [candidate({ sensitive: true }), 'sensitive'],
      [candidate({ hasCriteria: false }), 'no-criteria'],
      [candidate({ reviewable: false }), 'not-reviewable'],
      [candidate({ collision: true }), 'collision'],
      [candidate({ recommendation: 'keep-human' }), 'not-delegable'],
      [candidate({ recommendation: 'not-enough-data' }), 'not-delegable'],
    ];
    cases.forEach(([item, reason]) => {
      expect(rejectionReason(item), item.issueKey).toBe(reason);
      const plan = selectForNight([item], 60);
      expect(plan.taken).toHaveLength(0);
      expect(plan.skipped[0].reason).toBe(reason);
    });
  });

  it('respecte le budget de session et nomme le dépassement', () => {
    const plan = selectForNight([
      candidate({ issueKey: 'PROJ-1', estimateMinutes: 10 }),
      candidate({ issueKey: 'PROJ-2', estimateMinutes: 10 }),
    ], 15);
    expect(plan.taken).toEqual(['PROJ-1']);
    expect(plan.skipped[0]).toEqual({ issueKey: 'PROJ-2', reason: 'budget' });
  });

  it('prend les plus courts d’abord, et garde l’ordre stable', () => {
    const plan = selectForNight([
      candidate({ issueKey: 'PROJ-long', estimateMinutes: 30 }),
      candidate({ issueKey: 'PROJ-court', estimateMinutes: 5 }),
    ], 60);
    expect(plan.taken).toEqual(['PROJ-court', 'PROJ-long']);
  });

  it('un budget nul ne prend rien et le dit', () => {
    const plan = selectForNight([candidate()], 0);
    expect(plan.taken).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe('budget');
  });

  it('le plan est bilingue', () => {
    const plan = selectForNight([candidate()], 60);
    expect(plan.note.fr.length).toBeGreaterThan(10);
    expect(plan.note.en.length).toBeGreaterThan(10);
  });
});

describe('bilan du matin', () => {
  const plan = selectForNight([
    candidate({ issueKey: 'PROJ-1' }),
    candidate({ issueKey: 'PROJ-2', collision: true }),
  ], 60);

  it('distingue ce qui est prouvé, ce qui est rouvert et ce qui reste', () => {
    const report = morningReport({
      plan,
      outcomes: [
        { issueKey: 'PROJ-1', clean: true, reopened: false, proven: true },
      ],
    });
    expect(report.proven).toEqual(['PROJ-1']);
    expect(report.reopened).toBe(0);
    expect(report.left).toHaveLength(1);
    expect(report.left[0].issueKey).toBe('PROJ-2');
    expect(report.left[0].reason.length).toBeGreaterThan(3);
  });

  it('compte les réouvertures', () => {
    const report = morningReport({
      plan,
      outcomes: [
        { issueKey: 'PROJ-1', clean: false, reopened: true, proven: false },
      ],
    });
    expect(report.reopened).toBe(1);
    expect(report.proven).toHaveLength(0);
  });

  it('le taux de clôture propre sort avec son effectif et sa fourchette', () => {
    const report = morningReport({
      plan,
      outcomes: [
        { issueKey: 'PROJ-1', clean: true, reopened: false, proven: true },
      ],
    });
    expect(report.cleanClosed.n).toBe(1);
    expect(report.cleanClosed.rate).toBe(1);
    expect(report.cleanClosed.ciLow).toBeGreaterThanOrEqual(0);
    expect(report.cleanClosed.ciHigh).toBeLessThanOrEqual(1);
  });

  it('un rapport sans résultat ne plante pas', () => {
    const report = morningReport({ plan: selectForNight([], 60), outcomes: [] });
    expect(report.taken).toHaveLength(0);
    expect(report.cleanClosed.n).toBe(0);
    expect(report.note.fr.length).toBeGreaterThan(10);
  });
});
