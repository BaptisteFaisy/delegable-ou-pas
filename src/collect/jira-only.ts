/**
 * The Jira-only fallback: everything the app can still read when it has NO
 * right on the graph (SPEC §26 risk 1, SPEC §24, SPEC §17, SPEC §21; DP-03,
 * DP-04, DP-19).
 *
 * The demonstration site of the judges has no code repository at all, so this
 * adapter is what keeps the app useful there: the clean closure rests on the
 * reopenings and the incidents (SPEC §21 "équipe qui ne relie jamais ses
 * bugs"), the review load is simply not part of the facts (never a zero that
 * looks like a measure), and the involvement comes from the declared field or
 * from the adoption date — so the share of `unknown` explodes and
 * `widenThresholdForLevel` (domain/degraded-mode.ts) makes the app refuse to
 * conclude where it no longer has the material.
 *
 * Zero duplication: the lead time, the reopening window, the bug and incident
 * counts and the clean closure are the frozen domain ones (domain/outcome.ts),
 * the acceptance criteria are the frozen ADF reader (collect/jira-adf.ts), the
 * adoption-date involvement is the frozen candidate (domain/involvement.ts).
 *
 * Adapter: no `@forge/*`, no clock (no `Date.now()`), deterministic. Rule:
 * files < 500 lines, functions < 50 lines.
 */
import type { AdfNode, IssueLink, ReopeningFact, StatusChange, StatusHistory } from '../types-graph.js';
import type { Level, Source } from '../types.js';
import { fromAdoptionDate } from '../domain/involvement.js';
import {
  closureAt,
  countCausedBugs,
  countIncidents,
  firstClosureAt,
  hadReopening,
  isClean,
  leadTimeHours,
} from '../domain/outcome.js';
import { hasAcceptanceCriteria } from './jira-adf.js';
import { isDoneStatus } from './jira-history.js';

/**
 * The facts one ticket yields with Jira alone (SPEC §6, SPEC §21).
 *
 * There is deliberately NO review field: in `jira-only` the review load is
 * absent, and an absent measure must not exist as a number, not even zero
 * (SPEC §17, SPEC §21). `leadTimeH` is `null` when the ticket is open or its
 * history is empty: missing data stays missing, never a fake 0.
 */
export interface JiraOnlyFacts {
  readonly issueId: string;
  readonly leadTimeH: number | null;
  readonly reopened: boolean;
  readonly causedBugs: number;
  readonly incidents: number;
  readonly acceptanceCriteria: boolean;
  readonly declaredLevel: Level | null;
}

/**
 * The involvement read without any graph (SPEC §5, DP-03).
 *
 * `source` is `null` when no source exists at all: the absence of evidence
 * never borrows the name of a source, and the level stays `unknown` — never
 * `none` (DP-03, recipe 2). The brief writes `source: Source`; the honest
 * fallback needs `Source | null`, and the deviation is reported.
 */
export interface InvolvementWithoutGraph {
  readonly level: Level;
  readonly source: Source | null;
}

/** The date of the next passage to a done status, `null` when it never comes back. */
function nextDoneAt(changes: readonly StatusChange[], from: number): number | null {
  for (let i = from; i < changes.length; i++) {
    const change = changes[i];
    if (change === undefined || !isDoneStatus(change.to)) continue;
    const at = Date.parse(change.at);
    if (Number.isFinite(at)) return at;
  }
  return null;
}

/**
 * The reopenings read from the status history: every passage from a done
 * status to a non-done one (SPEC §6 "Réouverture"). A reopening still open at
 * reading time lasts `+Infinity` minutes — no wall clock in this module.
 * Under ten minutes the reopening is administrative and does not count
 * (SPEC §6, DP-04); `hadReopening` (domain) applies the thirty-day window.
 */
function reopeningsFromHistory(history: StatusHistory): ReopeningFact[] {
  const reopenings: ReopeningFact[] = [];
  const changes = history.changes;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (change === undefined) continue;
    if (!isDoneStatus(change.from) || isDoneStatus(change.to)) continue;
    const openedAt = Date.parse(change.at);
    if (!Number.isFinite(openedAt)) continue;
    const closedAgainAt = nextDoneAt(changes, i + 1);
    const durationMin = closedAgainAt === null
      ? Number.POSITIVE_INFINITY
      : (closedAgainAt - openedAt) / 60_000;
    reopenings.push({
      issueId: history.issueId,
      reopenedAt: change.at,
      durationMin,
      counts: durationMin >= 10,
    });
  }
  return reopenings;
}

/** The anchor of the reopening window: the first closure, else the last one (SPEC §6). */
function reopeningAnchor(history: StatusHistory): string {
  const first = firstClosureAt(history);
  return first === '' ? closureAt(history) : first;
}

/**
 * Reads the facts of one ticket with Jira alone: history, links, description,
 * declared field — and nothing from the graph (SPEC §17, SPEC §21).
 *
 * `options.waiting` carries the waiting statuses of the project for the lead
 * time (SPEC §6 "Délai", DP-04); absent by default, like every missing datum.
 */
export function collectJiraOnly(
  history: StatusHistory,
  links: readonly IssueLink[],
  description: AdfNode | null,
  declared: Level | null,
  options: { readonly waiting?: readonly string[] } = {},
): JiraOnlyFacts {
  const closedAt = closureAt(history);
  const measurable = history.closed && history.changes.length > 0;
  return {
    issueId: history.issueId,
    leadTimeH: measurable ? leadTimeHours(history, options.waiting ?? []) : null,
    reopened: hadReopening(reopeningsFromHistory(history), reopeningAnchor(history)),
    causedBugs: countCausedBugs(links, closedAt),
    incidents: countIncidents(links),
    acceptanceCriteria: hasAcceptanceCriteria(description),
    declaredLevel: declared,
  };
}

/**
 * The clean closure in `jira-only` mode: it rests on the reopenings and the
 * incidents only (SPEC §21), never on the review load, which does not exist
 * here. Uses the frozen `isClean` of the domain — zero duplication.
 */
export function cleanClosureFromFacts(facts: JiraOnlyFacts): boolean {
  return isClean(facts.reopened, facts.causedBugs, facts.incidents);
}

/**
 * The involvement of one ticket without any graph (SPEC §5, DP-03):
 * 1. the declared field, when the team wrote a level — the safest source left;
 * 2. the adoption date, when the ticket closed before it: `none` by
 *    construction, and `unknown` after it (the frozen `fromAdoptionDate`);
 * 3. otherwise `unknown` with NO source: the absence of evidence never
 *    borrows the name of a source, and never becomes `none` (DP-03).
 */
export function involvementWithoutGraph(
  declared: Level | null,
  adoptionDate: string | null,
  closedAt: string | null,
): InvolvementWithoutGraph {
  if (declared !== null) return { level: declared, source: 'closure-field' };
  if (adoptionDate !== null && closedAt !== null) {
    const candidate = fromAdoptionDate(closedAt, adoptionDate);
    return { level: candidate.level, source: candidate.source };
  }
  return { level: 'unknown', source: null };
}
