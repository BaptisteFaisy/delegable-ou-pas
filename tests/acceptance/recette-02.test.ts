/**
 * Recette 2 (SPEC §22) : « Un ticket sans aucun élément est classé "inconnue"
 * et n'entre dans aucun bras. » DP-03 — jamais compté comme « sans agent ».
 */
import { describe, expect, it } from 'vitest';
import { armOf } from '../../src/domain/cohort.js';
import { resolveInvolvement } from '../../src/domain/involvement.js';
import { levelLabel } from '../../src/viewmodel/common.js';
import { fr, ISSUE_ID } from './helpers.js';

describe('recette-02 — un ticket sans aucun élément', () => {
  it('est classé « inconnue » et n’entre dans aucun bras', () => {
    // Aucune source ne candidate : l'app écrit `unknown`, jamais `none` (DP-03).
    expect(resolveInvolvement(ISSUE_ID, [], '2026-03-02T18:00:00Z', '', '', '')).toBeNull();

    expect(armOf('unknown')).toBeNull();
    expect(armOf('unknown')).not.toBe('human');
    expect(levelLabel('unknown', fr)).toBe('implication inconnue');
  });
});
