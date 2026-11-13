/**
 * The reproducible proof of a decision, as a screen shows it (SPEC §7, §20;
 * DP-21).
 */
import { describe, expect, it } from 'vitest';
import { proofView, replayView } from '../../src/viewmodel/proof.js';

const INPUT = {
  issueKey: 'PROJ-412',
  policy: 'policy-2026-11',
  seed: 'seed-42',
  data: { agent: { clean: 34, total: 40 }, human: { clean: 18, total: 26 } },
  output: { conclusion: 'better', confidence: 'high' },
  computedAt: '2026-11-01T00:00:00Z',
};

describe('proofView', () => {
  it('montre la règle, la graine et les deux empreintes', () => {
    const view = proofView(INPUT);
    expect(view.issueKey).toBe('PROJ-412');
    expect(view.policyVersion).toBe('policy-2026-11');
    expect(view.seed).toBe('seed-42');
    expect(view.dataFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(view.outputFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(view.computedAt).toBe('2026-11-01T00:00:00Z');
    expect(view.reproducible).toBe(true);
  });

  it('donne la même empreinte à deux appels sur la même donnée', () => {
    const first = proofView(INPUT);
    const second = proofView(INPUT);
    expect(first.dataFingerprint).toBe(second.dataFingerprint);
    expect(first.outputFingerprint).toBe(second.outputFingerprint);
  });

  it('change d’empreinte quand la donnée change', () => {
    const first = proofView(INPUT);
    const second = proofView({ ...INPUT, data: { agent: { clean: 1, total: 2 } } });
    expect(first.dataFingerprint).not.toBe(second.dataFingerprint);
  });

  it('parle français et anglais', () => {
    const view = proofView(INPUT);
    expect(view.title.fr).not.toBe(view.title.en);
    expect(view.note.fr).not.toBe(view.note.en);
  });
});

describe('replayView', () => {
  it('constate un rejeu identique', () => {
    const proof = proofView(INPUT);
    const replay = replayView({
      proof: {
        issueKey: proof.issueKey,
        policyVersion: proof.policyVersion,
        dataFingerprint: proof.dataFingerprint,
        seed: proof.seed,
        outputFingerprint: proof.outputFingerprint,
        computedAt: proof.computedAt,
        reproducible: true,
        note: proof.note,
      },
      data: INPUT.data,
      output: INPUT.output,
      expectedData: INPUT.data,
      expectedOutput: INPUT.output,
    });
    expect(replay.same).toBe(true);
    expect(replay.mismatches).toEqual([]);
    expect(replay.differsLine).toBeNull();
  });

  it('nomme ce qui a bougé quand le rejeu diffère', () => {
    const proof = proofView(INPUT);
    const replay = replayView({
      proof: {
        issueKey: proof.issueKey,
        policyVersion: proof.policyVersion,
        dataFingerprint: proof.dataFingerprint,
        seed: proof.seed,
        outputFingerprint: proof.outputFingerprint,
        computedAt: proof.computedAt,
        reproducible: true,
        note: proof.note,
      },
      data: { agent: { clean: 1, total: 2 }, human: { clean: 18, total: 26 } },
      output: INPUT.output,
      expectedData: INPUT.data,
      expectedOutput: INPUT.output,
    });
    expect(replay.same).toBe(false);
    expect(replay.mismatches.length).toBeGreaterThan(0);
    expect(replay.differsLine).not.toBeNull();
    expect(replay.differsLine?.fr.length).toBeGreaterThan(0);
    expect(replay.differsLine?.en.length).toBeGreaterThan(0);
  });
});
