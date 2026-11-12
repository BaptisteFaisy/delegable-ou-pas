/**
 * Recette 11 (SPEC §22) : « Une cohorte portée par deux personnes est
 * masquée. » DP-17 — aucune statistique ne sort en dessous de trois personnes.
 */
import { describe, expect, it } from 'vitest';
import { cohortMask, maskCohort, MIN_PEOPLE, reportablePeopleCount } from '../../src/domain/privacy.js';
import { cohortView } from '../../src/viewmodel/cohort-detail.js';
import { cohortOutput } from '../viewmodel/fixtures.js';
import { fr } from './helpers.js';

describe('recette-11 — cohorte portée par deux personnes', () => {
  it('est masquée : aucun chiffre, aucune époque', () => {
    expect(MIN_PEOPLE).toBe(3);
    expect(maskCohort(2)).toBe(true);
    expect(cohortMask(2).masked).toBe(true);
    expect(reportablePeopleCount(2)).toBe(0);
    expect(maskCohort(3)).toBe(false);

    const view = cohortView(cohortOutput({ masked: true, peopleCount: 2 }), fr);
    expect(view.masked).toBe(true);
    expect(view.maskedNotice).not.toBeNull();
    expect(view.epochs).toEqual([]); // aucune statistique ne fuit par l'écran masqué
    expect(view.peopleLine).not.toContain('2');
  });
});
