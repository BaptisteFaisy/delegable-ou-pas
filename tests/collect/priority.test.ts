/**
 * Tests de la collecte priorisée : lire d'abord ce qui informe le plus
 * (SPEC §17, SPEC §7 règle 2, DP-18, idée 8 du brief B2). Aucun réseau, aucune
 * horloge : le module est pur et déterministe.
 */
import { describe, it, expect } from 'vitest';
import type { Arm } from '../../src/types.js';
import {
  cohortNeeds,
  explainPriority,
  informationGain,
  prioritise,
  DEFAULT_BUDGET_MINUTES,
  type CollectionCandidate,
} from '../../src/collect/priority.js';

const CLOSED = '2026-03-01T10:00:00.000Z';

/** Un ticket déjà lu, donc déjà compté dans la carte de couverture. */
function collected(issueId: string, cohortKey: string, arm: Arm): CollectionCandidate {
  return { issueId, cohortKey, arm, closedAt: CLOSED, alreadyCollected: true };
}

/** Remplit un bras de cohorte avec `count` tickets déjà collectés. */
function fill(cohortKey: string, arm: Arm, count: number, prefix: string): CollectionCandidate[] {
  return Array.from({ length: count }, (_, index) =>
    collected(`${prefix}-${String(index + 1).padStart(3, '0')}`, cohortKey, arm),
  );
}

/** Un ticket candidat : pas encore lu, donc pas encore dans la carte. */
function fresh(
  issueId: string,
  cohortKey: string,
  arm: Arm | 'unknown',
  extra: Partial<CollectionCandidate> = {},
): CollectionCandidate {
  return { issueId, cohortKey, arm, closedAt: CLOSED, alreadyCollected: false, ...extra };
}

/** Cohorte à 19/20 (un ticket du seuil) et cohorte à 5/40 (loin du seuil). */
function nearAndFar(): readonly CollectionCandidate[] {
  return [
    ...fill('bug/small', 'agent', 19, 'NEAR-A'),
    ...fill('bug/small', 'human', 20, 'NEAR-H'),
    ...fill('feature/large', 'agent', 5, 'FAR-A'),
    ...fill('feature/large', 'human', 40, 'FAR-H'),
  ];
}

describe('cohortNeeds', () => {
  it('compte les bras déjà collectés et ignore les implications inconnues', () => {
    const needs = cohortNeeds(
      [
        ...fill('bug/small', 'agent', 3, 'A'),
        ...fill('bug/small', 'human', 1, 'H'),
        fresh('U-1', 'bug/small', 'unknown'),
      ],
      20,
    );
    expect(needs).toEqual([{ cohortKey: 'bug/small', agentCount: 3, humanCount: 1, threshold: 20 }]);
  });

  it('ne compte pas un ticket déjà collecté deux fois et trie par clé de cohorte', () => {
    const needs = cohortNeeds(
      [collected('B-1', 'b/z', 'agent'), collected('A-1', 'a/y', 'human'), collected('A-2', 'a/y', 'human')],
      5,
    );
    expect(needs.map((need) => need.cohortKey)).toEqual(['a/y', 'b/z']);
    expect(needs[0]).toEqual({ cohortKey: 'a/y', agentCount: 0, humanCount: 2, threshold: 5 });
  });

  it('fait apparaître une cohorte encore jamais collectée (carte entièrement grise)', () => {
    const needs = cohortNeeds([fresh('N-1', 'chore/medium', 'agent')], 20);
    expect(needs).toEqual([{ cohortKey: 'chore/medium', agentCount: 0, humanCount: 0, threshold: 20 }]);
  });
});

describe('informationGain', () => {
  it('vaut 0 pour un ticket déjà collecté et pour un ticket non clos', () => {
    const needs = cohortNeeds(nearAndFar(), 20);
    expect(informationGain(collected('NEAR-A-001', 'bug/small', 'agent'), needs)).toBe(0);
    expect(informationGain(fresh('X-1', 'bug/small', 'agent', { closedAt: null }), needs)).toBe(0);
  });

  it('vaut 0 pour une cohorte absente des besoins', () => {
    expect(informationGain(fresh('X-1', 'inconnue', 'agent'), [])).toBe(0);
  });

  it('donne plus à une cohorte à un ticket du seuil qu’à une cohorte à quinze tickets', () => {
    const needs = cohortNeeds(nearAndFar(), 20);
    const near = informationGain(fresh('NEAR-NEW', 'bug/small', 'agent'), needs);
    const far = informationGain(fresh('FAR-NEW', 'feature/large', 'agent'), needs);
    expect(near).toBeGreaterThan(far);
  });

  it('donne plus au bras le plus petit de la cohorte qu’au bras le plus grand', () => {
    const needs = cohortNeeds(nearAndFar(), 20);
    const smaller = informationGain(fresh('S-1', 'bug/small', 'agent'), needs);
    const larger = informationGain(fresh('L-1', 'bug/small', 'human'), needs);
    expect(smaller).toBeGreaterThan(larger);
  });

  it('donne le plus à une implication inconnue dont les commits sont signés', () => {
    const needs = cohortNeeds(nearAndFar(), 20);
    const signed = informationGain(fresh('U-1', 'bug/small', 'unknown', { commitsSigned: true }), needs);
    const known = informationGain(fresh('K-1', 'bug/small', 'agent'), needs);
    const unsigned = informationGain(fresh('U-2', 'bug/small', 'unknown'), needs);
    expect(signed).toBeGreaterThan(known);
    expect(known).toBeGreaterThan(unsigned);
  });
});

describe('prioritise — recettes imposées', () => {
  it('fait passer une cohorte à 19/20 avant une cohorte à 5/40', () => {
    const candidates = [...nearAndFar(), fresh('NEAR-NEW', 'bug/small', 'agent'), fresh('FAR-NEW', 'feature/large', 'agent')];
    const slice = prioritise(candidates, { threshold: 20, budgetMinutes: 4, slicesPerMinute: 1 });
    expect(slice.issueIds[0]).toBe('NEAR-NEW');
    expect(slice.issueIds[1]).toBe('FAR-NEW');
  });

  it('ne reprend jamais un ticket déjà collecté', () => {
    const slice = prioritise(nearAndFar(), { threshold: 20, budgetMinutes: 4, slicesPerMinute: 1 });
    expect(slice.issueIds).toEqual([]);
    const mixed = prioritise([...nearAndFar(), fresh('NEAR-NEW', 'bug/small', 'agent')], {
      threshold: 20,
      budgetMinutes: 4,
      slicesPerMinute: 1,
    });
    expect(mixed.issueIds).toEqual(['NEAR-NEW']);
  });

  it('respecte le budget à un ticket près', () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      fresh(`NEW-${String(index + 1).padStart(3, '0')}`, 'bug/small', 'agent'),
    );
    const slice = prioritise([...nearAndFar(), ...many], { threshold: 20, budgetMinutes: 1, slicesPerMinute: 10 });
    expect(slice.issueIds.length).toBeLessThanOrEqual(11);
    expect(slice.issueIds.length).toBe(10);
    expect(slice.rationale).toHaveLength(10);
  });

  it('garde un ordre stable à jeu de données identique', () => {
    const candidates = [
      ...nearAndFar(),
      fresh('NEW-B', 'bug/small', 'agent'),
      fresh('NEW-A', 'bug/small', 'agent'),
      fresh('NEW-C', 'feature/large', 'human'),
    ];
    const options = { threshold: 20, budgetMinutes: 4, slicesPerMinute: 2 };
    const first = prioritise(candidates, options);
    const rotated = prioritise([...candidates.slice(2), ...candidates.slice(0, 2)], options);
    expect(first.issueIds).toEqual(['NEW-A', 'NEW-B', 'NEW-C']);
    expect(rotated).toEqual(first);
    expect(prioritise(candidates, options)).toEqual(first);
  });

  it('tranche les ex-aequo par identifiant de ticket', () => {
    const slice = prioritise(
      [fresh('ZZZ-1', 'bug/small', 'agent'), fresh('AAA-1', 'bug/small', 'agent')],
      { threshold: 20, budgetMinutes: 4, slicesPerMinute: 1 },
    );
    expect(slice.issueIds).toEqual(['AAA-1', 'ZZZ-1']);
  });

  it('borne le budget par défaut à quatre minutes de session', () => {
    const slice = prioritise([fresh('N-1', 'chore/medium', 'agent')], {});
    expect(slice.budgetMinutes).toBe(DEFAULT_BUDGET_MINUTES);
    expect(slice.issueIds.length).toBeLessThanOrEqual(DEFAULT_BUDGET_MINUTES + 1);
  });

  it('démarre sur une carte entièrement grise sans rester vide', () => {
    const slice = prioritise(
      [fresh('N-1', 'chore/medium', 'agent'), fresh('N-2', 'chore/medium', 'human')],
      { threshold: 20, budgetMinutes: 4, slicesPerMinute: 1 },
    );
    expect(slice.issueIds).toEqual(['N-1', 'N-2']);
  });

  it('ignore un ticket non clos : rien à mesurer pour l’instant', () => {
    const slice = prioritise([fresh('OPEN-1', 'bug/small', 'agent', { closedAt: null })], { threshold: 20 });
    expect(slice.issueIds).toEqual([]);
  });
});

describe('explainPriority', () => {
  it('dit pourquoi chaque ticket a été pris, en anglais et en français', () => {
    const slice = prioritise(
      [...nearAndFar(), fresh('NEAR-NEW', 'bug/small', 'agent'), fresh('U-1', 'bug/small', 'unknown', { commitsSigned: true })],
      { threshold: 20, budgetMinutes: 4, slicesPerMinute: 1 },
    );
    const text = explainPriority(slice);
    expect(text).toContain('Slice: 2 ticket(s) for 4 min of session.');
    expect(text).toContain('Tranche : 2 ticket(s) pour 4 min de session.');
    expect(text).toContain('NEAR-NEW');
    expect(text).toContain('commits are signed');
    expect(text).toContain('commits signés');
    expect(slice.rationale.map((entry) => entry.issueId)).toEqual(slice.issueIds);
  });

  it('explique une tranche vide au lieu de rendre un trou silencieux', () => {
    const text = explainPriority(prioritise(nearAndFar(), { threshold: 20 }));
    expect(text).toContain('Nothing to collect');
    expect(text).toContain('Rien à collecter');
  });
});
