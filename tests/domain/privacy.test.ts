/**
 * Tests of `src/domain/privacy.ts` — DP-17, DP-03, SPEC §5, §7 rule 8, §18,
 * §20, recipe 11.
 */
import { describe, expect, it } from 'vitest';

import type { Involvement, Level } from '../../src/types.js';
import {
  MIN_PEOPLE,
  PERSON_IDENTIFIER_FIELDS,
  cohortMask,
  isPersonSafe,
  maskCohort,
  personIdentifierLeak,
  reportablePeopleCount,
  unknownShare,
} from '../../src/domain/privacy.js';
import { percent } from '../../src/domain/stats.js';

/** Builds an involvement of one level, as the collector stores it. */
function involvement(level: Level): Involvement {
  return {
    issueId: 'DOP-1',
    level,
    source: 'mcp-declaration',
    client: '',
    model: '',
    sessionRef: '',
    evidence: [],
    decidedAt: '2026-11-01T09:00:00Z',
  };
}

/** A list of `total` involvements, `unknown` of them unknown. */
function involvements(total: number, unknown: number): Involvement[] {
  return Array.from({ length: total }, (_, index) =>
    involvement(index < unknown ? 'unknown' : 'driven'),
  );
}

describe('anonymat des mesures', () => {
  it('masque une cohorte portée par moins de trois personnes', () => {
    expect(MIN_PEOPLE).toBe(3);
    expect(maskCohort(0)).toBe(true);
    expect(maskCohort(2)).toBe(true);
    expect(maskCohort(3)).toBe(false);
  });

  it('recette-11 : rend la cohorte masquée avec sa raison, pas les chiffres', () => {
    expect(cohortMask(2)).toEqual({ masked: true, reason: 'fewer-than-3-people' });
    expect(cohortMask(3)).toEqual({ masked: false, reason: null });
  });

  it('rend zéro personne quand la cohorte est masquée', () => {
    expect(reportablePeopleCount(2)).toBe(0);
    expect(reportablePeopleCount(5)).toBe(5);
  });

  it('rend la part d’implication inconnue avec son effectif et sa fourchette', () => {
    const stat = unknownShare(involvements(41, 17));
    expect(stat.n).toBe(41);
    expect(percent(stat.rate)).toBe('41 %');
    expect(stat.ciLow).toBeGreaterThan(0);
    expect(stat.ciHigh).toBeLessThan(1);
  });

  it('rend une part inconnue vide quand aucun ticket n’est mesuré', () => {
    expect(unknownShare([])).toEqual({ n: 0, rate: 0, ciLow: 0, ciHigh: 1 });
  });

  it('ne compte aucune implication connue comme inconnue', () => {
    expect(unknownShare(involvements(10, 0)).rate).toBe(0);
    expect(unknownShare(involvements(10, 10)).rate).toBe(1);
  });

  it('signale un identifiant de personne dans un objet rendu', () => {
    const leak = personIdentifierLeak({ cohort: { n: 41, authorAccountId: 'abc123' } });
    expect(leak).toBe('cohort.authorAccountId');
    expect(isPersonSafe({ cohort: { authorAccountId: 'abc123' } })).toBe(false);
  });

  it('signale un identifiant de personne porté par une liste', () => {
    const leak = personIdentifierLeak({ items: [{ verdict: 'approved', accountId: 'x' }] });
    expect(leak).toBe('items[0].accountId');
  });

  it('signale le champ qui porte des personnes, avant même son contenu', () => {
    expect(personIdentifierLeak({ reviewers: [{ verdict: 'approved' }] })).toBe('reviewers');
  });

  it('reconnaît les champs séparés par des tirets bas ou des tirets', () => {
    expect(personIdentifierLeak({ author_account_id: 'x' })).toBe('author_account_id');
    expect(personIdentifierLeak({ 'display-name': 'x' })).toBe('display-name');
  });

  it('ne signale aucune fuite sur un objet de mesures', () => {
    const rendered = {
      n: 41,
      rate: 0.83,
      ciLow: 0.69,
      ciHigh: 0.91,
      medianH: 12,
      reviewerCount: 3,
      agentName: 'b',
      peopleCount: 5,
      nature: 'bugfix',
      label: 'nouveau modèle',
    };
    expect(personIdentifierLeak(rendered)).toBeNull();
    expect(isPersonSafe(rendered)).toBe(true);
  });

  it('ne signale rien sur une valeur simple ni sur un cycle', () => {
    expect(personIdentifierLeak(null)).toBeNull();
    expect(personIdentifierLeak(41)).toBeNull();
    expect(personIdentifierLeak('aucune personne ici')).toBeNull();
    const cyclic: Record<string, unknown> = { n: 1 };
    cyclic.self = cyclic;
    expect(personIdentifierLeak(cyclic)).toBeNull();
  });

  it('accepte une liste de champs interdits étendue par l’appelant', () => {
    expect(personIdentifierLeak({ nom: 'Alice' })).toBeNull();
    expect(personIdentifierLeak({ nom: 'Alice' }, [...PERSON_IDENTIFIER_FIELDS, 'nom'])).toBe('nom');
  });
});
