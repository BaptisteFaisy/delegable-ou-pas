/**
 * Tests of the reproducible proof.
 *
 * The point of the module: an auditor can recompute a decision and see
 * *what* changed when the answer differs. The tests therefore check stability
 * (same input → same fingerprint, whatever the key order), sensitivity (one
 * changed figure → a different fingerprint) and the quality of the difference
 * report (paths, not a yes/no answer).
 */
import { describe, expect, it } from 'vitest';
import {
  canonicalise,
  dataFingerprint,
  decisionProof,
  hashString,
  outputFingerprint,
  replayDecision,
} from '../../src/domain/proof.js';

const DATA = {
  arms: { agent: { n: 26, rate: 0.692 }, human: { n: 31, rate: 0.871 } },
  cohort: 'data-migration|billing|M',
};

const OUTPUT = {
  recommendation: 'delegate-with-review',
  confidence: 'medium',
  reasons: ['Cohorte : data-migration · billing · taille M (26 avec agent, 31 sans)'],
};

describe('empreinte de preuve', () => {
  it('hash stable et lisible', () => {
    expect(hashString('a')).toHaveLength(16);
    expect(hashString('a')).toBe(hashString('a'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashString('')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('canonicalise : les clés sont triées, l’ordre des tableaux ne l’est pas', () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));
    expect(canonicalise([1, 2])).not.toBe(canonicalise([2, 1]));
  });

  it('l’empreinte ne dépend pas de l’ordre des clés', () => {
    expect(dataFingerprint(DATA)).toBe(dataFingerprint({ cohort: DATA.cohort, arms: DATA.arms }));
    expect(outputFingerprint(OUTPUT)).toBe(outputFingerprint({ ...OUTPUT }));
  });

  it('l’empreinte change dès qu’une figure change', () => {
    const changed = { ...DATA, arms: { ...DATA.arms, agent: { n: 26, rate: 0.7 } } };
    expect(dataFingerprint(changed)).not.toBe(dataFingerprint(DATA));
  });

  it('une preuve porte la règle, la graine, les deux empreintes et l’instant', () => {
    const proof = decisionProof({
      issueKey: 'PROJ-412',
      policy: 'delegate-with-review@v3',
      seed: 'graine-2026-12',
      data: DATA,
      output: OUTPUT,
      computedAt: '2026-12-01T09:00:00Z',
    });
    expect(proof.issueKey).toBe('PROJ-412');
    expect(proof.policyVersion).toBe('delegate-with-review@v3');
    expect(proof.seed).toBe('graine-2026-12');
    expect(proof.dataFingerprint).toBe(dataFingerprint(DATA));
    expect(proof.outputFingerprint).toBe(outputFingerprint(OUTPUT));
    expect(proof.computedAt).toBe('2026-12-01T09:00:00Z');
    expect(proof.reproducible).toBe(true);
    expect(proof.note.fr.length).toBeGreaterThan(10);
    expect(proof.note.en.length).toBeGreaterThan(10);
  });

  it('rejouer les mêmes données redonne la même preuve', () => {
    const proof = decisionProof({
      issueKey: 'PROJ-412', policy: 'v3', seed: 'g', data: DATA, output: OUTPUT, computedAt: 'd',
    });
    const verdict = replayDecision({ proof, data: DATA, output: OUTPUT });
    expect(verdict.same).toBe(true);
    expect(verdict.mismatches).toEqual([]);
  });

  it('quand le rejeu diffère, le rapport dit QUOI diffère', () => {
    const proof = decisionProof({
      issueKey: 'PROJ-412', policy: 'v3', seed: 'g', data: DATA, output: OUTPUT, computedAt: 'd',
    });
    const changed = { ...DATA, arms: { ...DATA.arms, agent: { n: 26, rate: 0.7 } } };
    const verdict = replayDecision({ proof, data: changed, output: OUTPUT, expectedData: DATA, expectedOutput: OUTPUT });
    expect(verdict.same).toBe(false);
    expect(verdict.mismatches.length).toBeGreaterThan(0);
    expect(verdict.mismatches.join(' ')).toContain('arms.agent');
  });

  it('le rapport nomme aussi la sortie qui a bougé', () => {
    const proof = decisionProof({
      issueKey: 'PROJ-412', policy: 'v3', seed: 'g', data: DATA, output: OUTPUT, computedAt: 'd',
    });
    const verdict = replayDecision({
      proof,
      data: DATA,
      output: { ...OUTPUT, recommendation: 'keep-human' },
      expectedData: DATA,
      expectedOutput: OUTPUT,
    });
    expect(verdict.same).toBe(false);
    expect(verdict.mismatches.join(' ')).toContain('recommendation');
  });
});
