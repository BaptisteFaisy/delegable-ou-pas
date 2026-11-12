/**
 * Recette 10 (SPEC §22) : « Aucun écran n'affiche un taux sans son effectif ni
 * sa fourchette. » DP-08 — transverse : les cinq écrans qui rendent un taux
 * mesuré (clôture propre, implication connue, délai médian) passent tous par le
 * rendu unique `rateLine`/`medianText` (SPEC §7 règle 3). Les parts
 * descriptives (cases grises, points de sprint) ne sont pas des taux mesurés.
 */
import { describe, expect, it } from 'vitest';
import { calibrationView } from '../../src/viewmodel/calibration.js';
import { cohortView } from '../../src/viewmodel/cohort-detail.js';
import { coverageView } from '../../src/viewmodel/coverage.js';
import { mapView } from '../../src/viewmodel/delegation-map.js';
import { cardView } from '../../src/viewmodel/issue-card.js';
import { calibrationRow, card, cohortOutput, coverage, delegationMap } from '../viewmodel/fixtures.js';
import { fr, RATE_WITH_FIGURES } from './helpers.js';

describe('recette-10 — un taux ne s’affiche jamais seul', () => {
  it('la carte du ticket transporte effectif et fourchette avec le taux', () => {
    const view = cardView(card(), fr);
    // Contrat gelé : `agent`/`human` restent des ProportionStat|null complets —
    // l'écran ne peut pas rendre le taux sans son n ni son intervalle.
    for (const stat of [view.agent, view.human]) {
      expect(stat).not.toBeNull();
      expect(stat?.n).toBeGreaterThan(0);
      expect(stat?.ciLow ?? 0).toBeLessThan(stat?.ciHigh ?? 0);
    }
    expect(view.medianLine).toContain('(n = ');
  });

  it('le détail de cohorte rend chaque taux avec n et intervalle', () => {
    for (const epoch of cohortView(cohortOutput(), fr).epochs) {
      for (const arm of epoch.arms) {
        expect(arm.clean?.text).toMatch(RATE_WITH_FIGURES);
        expect(arm.leadTime).toContain('(n = ');
      }
    }
  });

  it('la carte de délégation montre les deux effectifs par case', () => {
    let measured = 0;
    for (const row of mapView(delegationMap(), fr).rows) {
      for (const cell of row.cells) {
        if (cell.masked) continue; // la case masquée dit la phrase de masque (DP-17)
        if (cell.agentN + cell.humanN === 0) {
          // Case vide : une phrase explicite, jamais un zéro inventé (SPEC §20).
          expect(cell.sampleLine).not.toContain('n = ');
          continue;
        }
        expect(cell.sampleLine).toMatch(/n = \d+ .* n = \d+/);
        measured += 1;
      }
    }
    expect(measured).toBeGreaterThan(0);
  });

  it('la calibration rend chaque taux observé avec n et intervalle', () => {
    const view = calibrationView([calibrationRow('delegate', 12, 0.75, 0.5, 0.9)], false, fr);
    const measured = view.rows.filter((row) => row.clean !== null);
    expect(measured.length).toBeGreaterThan(0);
    for (const row of measured) {
      expect(row.line).toMatch(RATE_WITH_FIGURES);
    }
  });

  it('la couverture rend l’implication connue avec n et intervalle', () => {
    const view = coverageView(coverage(), fr);
    expect(view.known?.text).toMatch(RATE_WITH_FIGURES);
    expect(view.knownLine).toContain(view.known?.text ?? '');
  });
});
