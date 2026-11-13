/**
 * Recette 7 (SPEC §22) : « Deux bras de composition trop différente affichent
 * "bras déséquilibrés", sans conclusion. » DP-10.
 */
import { describe, expect, it } from 'vitest';
import { compareBalance, composition, DEFAULT_BALANCE_TOLERANCE } from '../../src/domain/balance.js';
import { conclude } from '../../src/domain/conclusion.js';
import { DEFAULT_MIN_ARM_SIZE, proportion } from '../../src/domain/stats.js';
import { cohortView } from '../../src/viewmodel/cohort-detail.js';
import { cohortOutput } from '../viewmodel/fixtures.js';
import { fr } from './helpers.js';

describe('recette-07 — bras de composition trop différente', () => {
  const agent = composition(30, { S: 27, M: 3 }, { bugfix: 30 });
  const human = composition(30, { S: 6, M: 24 }, { bugfix: 30 });
  const balance = compareBalance(agent, human, DEFAULT_BALANCE_TOLERANCE);

  it('signale le déséquilibre et interdit de conclure', () => {
    expect(balance.balanced).toBe(false);
    expect(balance.signals.some((signal) => signal.criterion === 'size-mix')).toBe(true);

    const conclusion = conclude(proportion(25, 30), proportion(20, 30), DEFAULT_MIN_ARM_SIZE, balance);
    expect(conclusion).toBe('not-enough-data');
  });

  it('l’écran de la cohorte affiche « bras déséquilibrés », sans conclusion', () => {
    const base = cohortOutput();
    const view = cohortView(
      {
        ...base,
        epochs: base.epochs.map((epoch) => ({ ...epoch, balance, conclusion: 'not-enough-data' })),
      },
      fr,
    );
    const epoch = view.epochs[0];
    expect(epoch?.balanced).toBe(false);
    expect(epoch?.balanceLines[0]).toBe("Les deux bras ne sont pas comparables : l'app ne conclut pas");
    expect(epoch?.conclusionLine).toBe('On ne sait pas');
  });
});
