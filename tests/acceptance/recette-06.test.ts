/**
 * Recette 6 (SPEC §22) : « Une cohorte de 12 et 15 tickets affiche "pas assez
 * de recul". » DP-08, DP-09 — le seuil d'effectif interdit toute conclusion.
 */
import { describe, expect, it } from 'vitest';
import { conclude } from '../../src/domain/conclusion.js';
import { recommendFrom } from '../../src/domain/recommendation.js';
import { DEFAULT_MIN_ARM_SIZE, proportion } from '../../src/domain/stats.js';
import { recommendationLabel } from '../../src/viewmodel/common.js';
import { fr } from './helpers.js';

const BALANCED = { balanced: true, signals: [] };

describe('recette-06 — cohorte de 12 et 15 tickets', () => {
  it('affiche « pas assez de recul »', () => {
    const agent = proportion(10, 12);
    const human = proportion(12, 15);

    const conclusion = conclude(agent, human, DEFAULT_MIN_ARM_SIZE, BALANCED);
    expect(conclusion).toBe('not-enough-data');

    const recommendation = recommendFrom(conclusion, BALANCED, [], false);
    expect(recommendationLabel(recommendation, fr)).toBe('Pas assez de recul');
  });
});
