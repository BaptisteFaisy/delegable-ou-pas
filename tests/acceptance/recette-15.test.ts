/**
 * Recette 15 (SPEC §22) : « Un droit manquant sur le graphe apparaît à l'écran
 * de couverture, au lieu d'un zéro silencieux. » DP-19 — les chiffres partiels
 * sont dits partiels, jamais transformés en zéros muets.
 */
import { describe, expect, it } from 'vitest';
import { coverageView } from '../../src/viewmodel/coverage.js';
import { coverage } from '../viewmodel/fixtures.js';
import { fr } from './helpers.js';

const TESTED_AT = '2026-09-01T00:00:00Z';

describe('recette-15 — droit manquant sur le graphe', () => {
  it('apparaît à l’écran de couverture, au lieu d’un zéro silencieux', () => {
    const view = coverageView(
      coverage({
        permissions: [
          { objectType: 'commit', state: 'granted', testedAt: TESTED_AT },
          { objectType: 'pull-request', state: 'missing', testedAt: TESTED_AT },
        ],
        lastCollectionOk: false,
      }),
      fr,
    );

    expect(view.partial).toBe(true);
    expect(view.partialNotice).not.toBeNull();

    const missing = view.permissions.find((item) => item.objectType === 'pull-request');
    expect(missing?.state).toBe('missing');
    expect(missing?.stateLabel).toContain('manquant');
    // L'écran dit que les chiffres sont vidés, pas mis à zéro.
    expect(missing?.stateLabel).toContain('vidés');
  });
});
