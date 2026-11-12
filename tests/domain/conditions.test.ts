/**
 * Tests of the executable conditions (SPEC §12, SPEC §8, SPEC §5; DP-12, DP-26).
 */
import { describe, expect, it } from 'vitest';
import type { FailureCause } from '../../src/ports.js';
import {
  CONDITION_KINDS,
  NOT_VERIFIABLE,
  checkConditions,
  conditionLabel,
  conditionsFor,
  failureCauseLabels,
} from '../../src/domain/conditions.js';
import type {
  ConditionFact,
  ConditionKind,
  ExecutableCondition,
} from '../../src/domain/conditions.js';

/** The kinds of a report, in order. */
function kindsOf(conditions: readonly ExecutableCondition[]): readonly ConditionKind[] {
  return conditions.map(condition => condition.kind);
}

/** One observed fact, message-free. */
function fact(kind: ConditionKind, observed: boolean | null, detail = 'observed'): ConditionFact {
  return { kind, observed, detail };
}

describe('conditionsFor — derivation', () => {
  it('derives the criteria of the delegate recommendation, all required', () => {
    const conditions = conditionsFor('delegate', []);
    expect(kindsOf(conditions)).toEqual(['acceptance-criteria', 'evidence-per-criterion']);
    expect(conditions.every(condition => condition.required)).toBe(true);
  });

  it('adds two reviewers for delegate-with-review, zone owner stays advisory', () => {
    const conditions = conditionsFor('delegate-with-review', []);
    expect(kindsOf(conditions)).toContain('two-reviewers');
    const advisory = conditions.find(condition => condition.kind === 'zone-owner-review');
    expect(advisory?.required).toBe(false);
    const required = conditions.find(condition => condition.kind === 'two-reviewers');
    expect(required?.required).toBe(true);
  });

  it('derives nothing from keep-human and not-enough-data alone', () => {
    expect(conditionsFor('keep-human', [])).toEqual([]);
    expect(conditionsFor('not-enough-data', [])).toEqual([]);
  });

  it('demands a migration test when the cohort reopens on migrations', () => {
    const conditions = conditionsFor('delegate', ['réouvertures après migration non rejouable']);
    const migration = conditions.find(condition => condition.kind === 'migration-test');
    expect(migration?.required).toBe(true);
    // The recommendation conditions are kept.
    expect(kindsOf(conditions)).toContain('acceptance-criteria');
  });

  it('derives from an English cause too, and upgrades an advisory kind', () => {
    const conditions = conditionsFor('delegate-with-review', ['missing acceptance criteria']);
    expect(kindsOf(conditions)).toContain('acceptance-criteria');
    const sensitive = conditionsFor('keep-human', ['sensitive zone touched without review']);
    expect(kindsOf(sensitive)).toEqual(['no-sensitive-zone']);
    expect(sensitive[0]?.required).toBe(true);
  });

  it('never confuses a sensitive zone with a zone owner review', () => {
    const conditions = conditionsFor('delegate', ['zone sensible mal cartographiée']);
    expect(kindsOf(conditions)).toContain('no-sensitive-zone');
    expect(kindsOf(conditions)).not.toContain('zone-owner-review');
  });

  it('emits each kind once, in the stable CONDITION_KINDS order', () => {
    const causes = ['migration cassée', 'migration non rejouable', 'relecture absente'];
    const conditions = conditionsFor('delegate-with-review', causes);
    const kinds = kindsOf(conditions);
    expect(new Set(kinds).size).toBe(kinds.length);
    const indexes = kinds.map(kind => CONDITION_KINDS.indexOf(kind));
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
  });

  it('ignores a cause that asks for no condition', () => {
    expect(conditionsFor('delegate', ['délai trop long'])).toEqual(conditionsFor('delegate', []));
  });

  it('is deterministic: same inputs, same output', () => {
    const causes = ['migration non rejouable', 'preuve manquante'];
    expect(JSON.stringify(conditionsFor('delegate', causes)))
      .toBe(JSON.stringify(conditionsFor('delegate', causes)));
  });

  it('labels every kind in both languages (SPEC §16)', () => {
    for (const kind of CONDITION_KINDS) {
      const label = conditionLabel(kind);
      expect(label.startsWith(`${kind} — `)).toBe(true);
      expect(label.split(' — ').length).toBe(3);
    }
  });
});

describe('failureCauseLabels — local converter', () => {
  it('turns the frozen FailureCause interface into plain cause strings', () => {
    const causes: readonly FailureCause[] = [
      { cause: 'migration non rejouable', count: 4 },
      { cause: 'preuve manquante', count: 2 },
    ];
    expect(failureCauseLabels(causes)).toEqual(['migration non rejouable', 'preuve manquante']);
    expect(failureCauseLabels([])).toEqual([]);
  });
});

describe('checkConditions — three-valued report', () => {
  const conditions = conditionsFor('delegate-with-review', ['migration non rejouable']);

  it('is satisfied only when every check is true', () => {
    const facts = kindsOf(conditions).map(kind => fact(kind, true, `${kind} seen`));
    const report = checkConditions(conditions, facts, '2026-11-01T00:00:00.000Z');
    expect(report.allSatisfied).toBe(true);
    expect(report.unknownCount).toBe(0);
    expect(report.checks.every(check => check.checkedAt === '2026-11-01T00:00:00.000Z')).toBe(true);
  });

  it('turns a missing fact into null, never into a failure nor a success', () => {
    const facts = kindsOf(conditions)
      .filter(kind => kind !== 'migration-test')
      .map(kind => fact(kind, true));
    const report = checkConditions(conditions, facts);
    const migration = report.checks.find(check => check.kind === 'migration-test');
    expect(migration?.satisfied).toBeNull();
    expect(migration?.evidence).toBe(NOT_VERIFIABLE);
    expect(report.allSatisfied).toBe(false);
    expect(report.unknownCount).toBe(1);
  });

  it('counts every unknown and fails allSatisfied on a single null', () => {
    const facts = kindsOf(conditions).map(kind => fact(kind, kind === 'two-reviewers' ? null : true));
    const report = checkConditions(conditions, facts);
    expect(report.allSatisfied).toBe(false);
    expect(report.unknownCount).toBe(1);
  });

  it('reports an observed false as a failure with its detail as evidence', () => {
    const facts = kindsOf(conditions).map(kind =>
      fact(kind, kind === 'migration-test' ? false : true, kind === 'migration-test' ? 'no path matched' : 'seen'),
    );
    const report = checkConditions(conditions, facts);
    expect(report.allSatisfied).toBe(false);
    expect(report.unknownCount).toBe(0);
    expect(report.checks.find(check => check.kind === 'migration-test')?.evidence)
      .toBe('no path matched');
  });

  it('ignores a fact for a kind no condition asks for, and defaults checkedAt', () => {
    const report = checkConditions(conditionsFor('keep-human', []), [fact('migration-test', true)]);
    expect(report.checks).toEqual([]);
    expect(report.allSatisfied).toBe(true);
    const withConditions = checkConditions(conditions, [fact('migration-test', true)]);
    expect(withConditions.checks[0]?.checkedAt).toBe('');
  });
});
