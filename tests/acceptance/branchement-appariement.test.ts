/**
 * Branchement A3 : `matching.ts` en repli de `balance.ts` (SPEC §7 règle 5,
 * DP-10). Des bras déséquilibrés ne renoncent plus d'emblée : l'appariement
 * exact puis le plus proche voisin tentent de sauver la comparaison sur un
 * sous-ensemble rééquilibré ; quand le sauvetage n'est pas honnête, la cohorte
 * reste à « on ne sait pas » (recette 7 inchangée).
 */
import { describe, expect, it } from 'vitest';
import { compareBalance, composition, matchedRescue, MIN_MATCHED_SHARE } from '../../src/domain/balance.js';
import type { MatchableTicket } from '../../src/domain/matching.js';
import { cohortKeyOf } from '../../src/domain/cohort.js';
import { cohortStatRows } from '../../src/handlers/recompute.js';
import type { ProjectFacts } from '../../src/handlers/project-facts.js';
import type { CohortTicket } from '../../src/domain/cohort.js';
import { AT, sampleIssueClass, sampleOutcome, sampleSettings } from '../db/fixtures.js';

function matchable(issueId: string, arm: 'agent' | 'human', size: string, nature = 'migration'): MatchableTicket {
  return { issueId, arm, nature, zone: 'billing', size, leadTimeH: 24 };
}

function factsOf(clean: ReadonlySet<string>): ProjectFacts {
  const outcomes = new Map([...clean].map((id) => [id, { ...sampleOutcome(id), clean: true }]));
  for (const id of ['A1', 'A2', 'A3', 'A4', 'H1', 'H2', 'H3', 'H4', 'B1', 'B2']) {
    if (!outcomes.has(id)) outcomes.set(id, { ...sampleOutcome(id), clean: false });
  }
  return { involvements: new Map(), classes: new Map(), outcomes, reviews: new Map() };
}

function cohortTicket(issueId: string, size: string, agentArm: boolean, nature = 'migration'): CohortTicket {
  return {
    issueId,
    projectId: 'PROJ',
    level: agentArm ? 'driven' : 'none',
    issueClass: { ...sampleIssueClass(issueId), size, nature },
  };
}

describe('branchement A3 — l’appariement en repli des bras déséquilibrés', () => {
  it('sauve la comparaison quand un sous-ensemble apparié est équilibré', () => {
    // Bras agent : 2 S + 2 M ; bras humain : 4 M → taille déséquilibrée.
    const agent = [matchable('A1', 'agent', 'S'), matchable('A2', 'agent', 'S'),
      matchable('A3', 'agent', 'M'), matchable('A4', 'agent', 'M')];
    const human = [matchable('H1', 'human', 'M'), matchable('H2', 'human', 'M'),
      matchable('H3', 'human', 'M'), matchable('H4', 'human', 'M')];
    expect(compareBalance(
      composition(4, { S: 2, M: 2 }, { migration: 4 }),
      composition(4, { M: 4 }, { migration: 4 }),
    ).balanced).toBe(false);

    const rescue = matchedRescue(agent, human);
    expect(rescue).not.toBeNull();
    expect(rescue?.matched.matchedShare).toBeGreaterThanOrEqual(MIN_MATCHED_SHARE);
    expect([...(rescue?.agentIds ?? [])].sort()).toEqual(['A3', 'A4']);
  });

  it('produit une conclusion sur le sous-ensemble apparié, via cohortStatRows', () => {
    const tickets = [
      cohortTicket('A1', 'S', true), cohortTicket('A2', 'S', true),
      cohortTicket('A3', 'M', true), cohortTicket('A4', 'M', true),
      cohortTicket('H1', 'M', false), cohortTicket('H2', 'M', false),
      cohortTicket('H3', 'M', false), cohortTicket('H4', 'M', false),
    ];
    // Les deux M appariés : propres avec agent (A3, A4), sales sans (H1, H2).
    const facts = factsOf(new Set(['A3', 'A4']));
    const settings = { ...sampleSettings(), minArmSize: 2 };
    const key = cohortKeyOf({ ...sampleIssueClass('A1') }, 'nature-zone-size');

    const rows = cohortStatRows(settings, 'ep-1', key, tickets, facts, AT);
    const agentRow = rows.find((row) => row.arm === 'agent');
    expect(agentRow?.conclusion).toBe('better');
    expect(agentRow?.clean.n).toBe(2); // le sous-ensemble apparié, pas les 4
  });

  it('refuse le sauvetage quand rien n’est comparable : « on ne sait pas » reste', () => {
    const agent = [matchable('B1', 'agent', 'S', 'migration'), matchable('B2', 'agent', 'S', 'migration')];
    const human = [matchable('H1', 'human', 'M', 'refactor'), matchable('H2', 'human', 'M', 'refactor')];

    const tickets = [
      cohortTicket('B1', 'S', true), cohortTicket('B2', 'S', true),
      cohortTicket('H1', 'M', false, 'refactor'), cohortTicket('H2', 'M', false, 'refactor'),
    ];
    const facts = factsOf(new Set(['B1', 'B2']));
    const settings = { ...sampleSettings(), minArmSize: 2 };
    const key = cohortKeyOf({ ...sampleIssueClass('B1') }, 'nature-zone-size');

    expect(matchedRescue(agent, human)).toBeNull();
    const rows = cohortStatRows(settings, 'ep-1', key, tickets, facts, AT);
    expect(rows.find((row) => row.arm === 'agent')?.conclusion).toBe('not-enough-data');
  });
});
