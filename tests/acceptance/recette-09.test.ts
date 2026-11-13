/**
 * Recette 9 (SPEC §22) : « Un ticket lié à un incident ouvert ne reçoit jamais
 * "à confier à un agent", et la carte dit pourquoi. » DP-12.
 */
import { describe, expect, it } from 'vitest';
import { guardrails, recommendFrom } from '../../src/domain/recommendation.js';
import type { Conclusion } from '../../src/types.js';
import { guardrailLabel } from '../../src/viewmodel/common.js';
import { cardView } from '../../src/viewmodel/issue-card.js';
import { card } from '../viewmodel/fixtures.js';
import { fr } from './helpers.js';

const BALANCED = { balanced: true, signals: [] };
const CONCLUSIONS: readonly Conclusion[] = ['better', 'same', 'worse', 'not-enough-data'];

describe('recette-09 — incident ouvert lié au ticket', () => {
  it('ne reçoit jamais « à confier à un agent »', () => {
    const fired = guardrails(true, 'api', [], true);
    expect(fired).toEqual(['open-incident']);

    // Quelle que soit la statistique de la cohorte, le garde-fou interdit `delegate`.
    for (const conclusion of CONCLUSIONS) {
      for (const delayBetter of [false, true]) {
        expect(recommendFrom(conclusion, BALANCED, fired, delayBetter)).not.toBe('delegate');
      }
    }
  });

  it('la carte dit pourquoi', () => {
    const view = cardView(card({ guardrails: ['open-incident'] }), fr);
    expect(view.guardrails).toEqual(['open-incident']);
    expect(guardrailLabel('open-incident', fr)).toBe('Un incident est ouvert sur ce ticket');
  });
});
