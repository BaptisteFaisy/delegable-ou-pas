/**
 * Branchement A5 : `power.ts` et `sequential.ts` dans l'essai contrôlé
 * (SPEC §11, DP-27). L'essai sait dire « pas réalisable chez vous » et ses
 * regards quotidiens sont corrigés par les frontières d'O'Brien-Fleming.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALPHA } from '../../src/domain/power.js';
import { lookAtTrial, planTrial, REOPENING_STOP_THRESHOLD } from '../../src/domain/trial.js';

describe('branchement A5 — l’essai calcule sa taille et corrige ses regards', () => {
  it('dit quand l’essai n’est pas réalisable au rythme de l’équipe', () => {
    const plan = planTrial(0.7, 4, 0.1);
    expect(plan.nPerArm).toBeGreaterThan(0);
    expect(plan.feasible).toBe(false);
    expect(plan.weeksNeeded).not.toBeNull();
    expect(plan.alpha).toBe(DEFAULT_ALPHA);
  });

  it('dit quand l’essai est réalisable', () => {
    expect(planTrial(0.7, 40, 0.1).feasible).toBe(true);
  });

  it('sans effet imposé, la fenêtre fixe la taille et l’effet détectable', () => {
    const plan = planTrial(0.7, 4);
    expect(plan.feasible).toBe(true);
    expect(plan.detectableEffect).toBeGreaterThan(0);
  });

  it('corrige les regards quotidiens : l’efficacité seulement au-delà de la frontière', () => {
    // 2,2 > 1,96 conclurait à tort au premier regard d'une série de cinq.
    const first = lookAtTrial({
      plannedLooks: 5,
      looks: [],
      zObserved: 2.2,
      informationFraction: 0.2,
      reopeningsAgent: 0,
      reopeningsHuman: 0,
    });
    expect(first.stop).toBe('continue');
    expect(first.boundary).toBeGreaterThan(1.96);

    // Au dernier regard, la frontière revient à 1,96 : le même z conclut.
    const last = lookAtTrial({
      plannedLooks: 5,
      looks: [2.0, 2.1, 2.0, 2.1],
      zObserved: 2.3,
      informationFraction: 1,
      reopeningsAgent: 0,
      reopeningsHuman: 0,
    });
    expect(last.stop).toBe('efficacy');
    expect(last.alphaSpentTotal).toBeLessThanOrEqual(DEFAULT_ALPHA + 1e-9);
  });

  it('l’arrêt de sécurité du bras agent passe avant tout', () => {
    const decision = lookAtTrial({
      plannedLooks: 5,
      looks: [],
      zObserved: 0.5,
      informationFraction: 0.2,
      reopeningsAgent: REOPENING_STOP_THRESHOLD,
      reopeningsHuman: 0,
    });
    expect(decision.stop).toBe('safety');
  });
});
