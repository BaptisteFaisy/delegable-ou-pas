/**
 * Le mode démonstration (lot L10 §4) : le jeu d'exemple (L9) produit la carte
 * de PROJ-412 exactement comme au SPEC §8, à travers l'assemblage gelé (L7) :
 * 69 % [50 ; 84] contre 87 % [71 ; 95], 26/31, délai médian 1,5 j contre 3 j.
 * DP-20 — c'est la preuve que la démo des juges est juste.
 */
import { describe, expect, it } from 'vitest';
import { recommendFrom } from '../../src/domain/recommendation.js';
import { sampleCards } from '../../src/sample/index.js';
import { cardView } from '../../src/viewmodel/issue-card.js';
import { medianText, rateLine, recommendationLabel } from '../../src/viewmodel/common.js';
import { fr, RATE_WITH_FIGURES } from './helpers.js';

function cardOfProj412() {
  const card = sampleCards().find((candidate) => candidate.issueKey === 'PROJ-412');
  expect(card).toBeDefined();
  return card;
}

describe('mode démonstration — la carte de PROJ-412 (SPEC §8)', () => {
  it('affiche 69 % [50 ; 84] contre 87 % [71 ; 95], avec les effectifs 26/31', () => {
    const card = cardOfProj412();
    if (card === undefined) return;

    expect(rateLine(card.agent, fr)?.text).toBe('69 % (n = 26, intervalle à 95 % [50 % ; 84 %])');
    expect(rateLine(card.human, fr)?.text).toBe('87 % (n = 31, intervalle à 95 % [71 % ; 95 %])');
    expect(rateLine(card.agent, fr)?.text).toMatch(RATE_WITH_FIGURES);
    expect(card.agent?.n).toBe(26);
    expect(card.human?.n).toBe(31);
  });

  it('affiche le délai médian : 1,5 jour avec agent, 3 jours sans', () => {
    const card = cardOfProj412();
    if (card === undefined) return;

    expect(card.agentLeadTime?.medianH).toBe(36); // 1,5 jour
    expect(card.humanLeadTime?.medianH).toBe(72); // 3 jours
    expect(medianText(card.agentLeadTime, fr)).toBe('36 h (n = 26)');
    expect(medianText(card.humanLeadTime, fr)).toBe('72 h (n = 31)');
  });

  it('recommande « agent, relecture renforcée », confiance moyenne, comme au SPEC', () => {
    const card = cardOfProj412();
    if (card === undefined) return;

    expect(card.value).toBe('delegate-with-review');
    expect(recommendationLabel(card.value, fr)).toBe('Agent, relecture renforcée');
    expect(card.confidence).toBe('medium');
    expect(card.reasons.join(' ')).toContain('écart non établi');
    expect(card.referenceIssueKeys).toEqual(['PROJ-207', 'PROJ-233', 'PROJ-301']);
  });

  it('passe par l’assemblage gelé : la carte suit la règle de recommandation', () => {
    const card = cardOfProj412();
    if (card === undefined) return;

    const delayBetter =
      card.agentLeadTime !== null &&
      card.humanLeadTime !== null &&
      card.agentLeadTime.medianH < card.humanLeadTime.medianH;
    expect(card.value).toBe(recommendFrom(card.conclusion, card.balance, card.guardrails, delayBetter));
  });

  it('l’écran porte le drapeau de démonstration jusqu’au rendu', () => {
    const card = cardOfProj412();
    if (card === undefined) return;

    expect(card.demo).toBe(true);
    const view = cardView(card, fr);
    expect(view.demo).toBe(true);
    expect(view.title).toContain('PROJ-412');
    expect(view.medianLine).toContain('36');
    expect(view.medianLine).toContain('72');
  });
});
