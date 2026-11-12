/**
 * Recette 5 (SPEC §22) : « Un ticket clos il y a dix jours n'entre pas encore
 * dans le taux de clôture propre. » DP-04, DP-08 — fenêtre de 60 jours (SPEC §6).
 */
import { describe, expect, it } from 'vitest';
import { isMature, judgeable, judgeableAt } from '../../src/domain/maturity.js';
import { sampleOutcome } from '../db/fixtures.js';
import { daysAgo, NOW } from './helpers.js';

describe('recette-05 — clos il y a dix jours', () => {
  it('n’entre pas encore dans le taux de clôture propre', () => {
    const recent = { ...sampleOutcome(), closedAt: daysAgo(10) };
    const aged = { ...sampleOutcome('PROJ-2'), closedAt: daysAgo(70) };

    // Il faudra 60 jours après la clôture pour pouvoir juger (SPEC §6).
    expect(isMature(recent, NOW)).toBe(false);
    expect(Date.parse(judgeableAt(recent))).toBeGreaterThan(Date.parse(NOW));
    expect(isMature(aged, NOW)).toBe(true);

    // Seuls les tickets jugeables entrent dans le taux ; les autres restent visibles.
    expect(judgeable([recent, aged], NOW).map((outcome) => outcome.issueId)).toEqual(['PROJ-2']);
  });
});
