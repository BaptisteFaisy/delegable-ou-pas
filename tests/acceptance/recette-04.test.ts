/**
 * Recette 4 (SPEC §22) : « Un ticket rouvert sous 30 jours n'est pas une
 * clôture propre. » DP-04 — la réouverture casse la clôture propre.
 */
import { describe, expect, it } from 'vitest';
import { computeOutcome, hadReopening, isClean } from '../../src/domain/outcome.js';
import { closedHistory } from '../handlers/app-deps.js';
import { ISSUE_ID, reopening } from './helpers.js';

const CLOSED_AT = '2026-11-05T17:00:00Z';
const REOPENED_UNDER_30_DAYS = '2026-11-10T09:00:00Z';

describe('recette-04 — rouvert sous 30 jours', () => {
  it('n’est pas une clôture propre', () => {
    const facts = [reopening(REOPENED_UNDER_30_DAYS)];
    expect(hadReopening(facts, CLOSED_AT)).toBe(true);

    const outcome = computeOutcome(ISSUE_ID, closedHistory(ISSUE_ID, CLOSED_AT), [], facts, []);
    expect(outcome.reopened).toBe(true);
    expect(outcome.clean).toBe(false);
    expect(isClean(true, 0, 0)).toBe(false);
  });
});
