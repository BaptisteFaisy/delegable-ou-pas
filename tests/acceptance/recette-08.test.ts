/**
 * Recette 8 (SPEC §22) : « Une cohorte à l'écart établi en défaveur des agents
 * produit "à garder pour un humain" sur un nouveau ticket semblable. » DP-09, DP-11.
 */
import { describe, expect, it } from 'vitest';
import { cohortKeyOf, isInCohort } from '../../src/domain/cohort.js';
import { GAP_ESTABLISHED, gapEstablished } from '../../src/domain/conclusion.js';
import { recommendFrom } from '../../src/domain/recommendation.js';
import { recommendationLabel } from '../../src/viewmodel/common.js';
import { sampleIssueClass } from '../db/fixtures.js';
import { fr } from './helpers.js';

const BALANCED = { balanced: true, signals: [] };

describe('recette-08 — écart établi en défaveur des agents', () => {
  it('produit « à garder pour un humain » sur un nouveau ticket semblable', () => {
    // La cohorte a conclu « moins bien » avec un écart établi (SPEC §7 règle 4).
    expect(gapEstablished('worse')).toBe(true);
    expect(GAP_ESTABLISHED).toBe('écart établi');

    const recommendation = recommendFrom('worse', BALANCED, [], false);
    expect(recommendation).toBe('keep-human');
    expect(recommendationLabel(recommendation, fr)).toBe('À garder pour un humain');

    // Un nouveau ticket semblable tombe bien dans la cohorte qui porte cet écart.
    const cohort = cohortKeyOf(sampleIssueClass(), 'nature-zone-size');
    expect(isInCohort(cohort, { ...sampleIssueClass('PROJ-77') })).toBe(true);
  });
});
