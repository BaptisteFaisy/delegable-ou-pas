/**
 * Shared helpers of the sixteen recipes of SPEC §22 (lot L10).
 *
 * Every recipe asserts the literal French wording of the SPEC, so the
 * translator is built once here, and the small facts a scenario needs
 * (reopening, link) are built once here too — zero duplication between the
 * sixteen files.
 */
import { createTranslator, type Translate } from '../../src/i18n/index.js';
import type { IssueLink, ReopeningFact } from '../../src/types-graph.js';

/** The French wording, the literal one of the SPEC (SPEC §20). */
export const fr: Translate = createTranslator('fr');

/** The ticket the recipes use when they need one identifier. */
export const ISSUE_ID = 'PROJ-1';

/** The reference "now" of the recipes that reason in days. */
export const NOW = '2026-11-30T12:00:00Z';

/**
 * The only shape a measured rate may take on a screen (SPEC §7 rule 3,
 * recipe 10): the rate, its sample size and its 95 % interval, together.
 */
export const RATE_WITH_FIGURES = /^\d+ % \(n = \d+, intervalle à 95 % \[\d+ % ; \d+ %\]\)$/;

/** One counted reopening of `ISSUE_ID` (SPEC §6 "Réouverture"). */
export function reopening(reopenedAt: string, over: Partial<ReopeningFact> = {}): ReopeningFact {
  return { issueId: ISSUE_ID, reopenedAt, durationMin: 120, counts: true, ...over };
}

/** One link between tickets (SPEC §6 "Bug à la suite", "Incident"). */
export function link(over: Partial<IssueLink> = {}): IssueLink {
  return {
    issueId: ISSUE_ID,
    linkedIssueId: 'PROJ-9',
    type: 'relates-to',
    linkedIsIncident: false,
    linkedIsBug: false,
    createdAt: '2026-03-20T10:00:00Z',
    ...over,
  };
}

/** Number of days before `NOW`, as an instant the domain can parse. */
export function daysAgo(days: number): string {
  const ms = Date.parse(NOW) - days * 86_400_000;
  return new Date(ms).toISOString();
}
