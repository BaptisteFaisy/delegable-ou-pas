/**
 * Recette 3 (SPEC §22) : « Un ticket clos avant la date d'adoption entre dans
 * le bras "sans agent". » DP-01 — la cinquième source, la date d'adoption.
 */
import { describe, expect, it } from 'vitest';
import { armOf } from '../../src/domain/cohort.js';
import { fromAdoptionDate, resolveInvolvement } from '../../src/domain/involvement.js';
import { armLabel, sourceLabel } from '../../src/viewmodel/common.js';
import { fr, ISSUE_ID } from './helpers.js';

const ADOPTION_DATE = '2026-04-01T00:00:00Z';
const CLOSED_BEFORE = '2026-03-02T17:00:00Z';

describe('recette-03 — clos avant la date d’adoption', () => {
  it('entre dans le bras « sans agent »', () => {
    const candidate = fromAdoptionDate(CLOSED_BEFORE, ADOPTION_DATE);
    expect(candidate.level).toBe('none');
    expect(candidate.source).toBe('adoption-date');

    const involvement = resolveInvolvement(ISSUE_ID, [candidate], CLOSED_BEFORE, '', '', '');
    expect(involvement?.level).toBe('none');
    expect(armOf('none')).toBe('human');
    expect(armLabel('human', fr)).toBe('Sans agent');
    expect(sourceLabel('adoption-date', fr)).toBe("date d'adoption déclarée");
  });
});
