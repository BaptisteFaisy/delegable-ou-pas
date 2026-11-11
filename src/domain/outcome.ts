/**
 * What happens to a ticket afterwards (SPEC §6 "Mesurer ce qui arrive ensuite",
 * SPEC §21; DP-04, recipes 4 and 5).
 *
 * The clean closure is the main measure: closed without a reopening, without a
 * following bug and without an incident inside the window. The neighbour bug is
 * a weak signal, rendered apart and never inside the clean closure (SPEC §6).
 */
import type { Involvement, Outcome } from '../types.js';
import type {
  IssueLink,
  NeighborBugFact,
  ReopeningFact,
  StatusChange,
  StatusHistory,
} from '../types-graph.js';

/** One day, in milliseconds. */
const DAY_MS = 86_400_000;

/** Reopening window, in days (SPEC §6 "Réouverture"). */
const REOPENING_DAYS = 30;

/** Following bug and incident window, in days (SPEC §6 "Bug à la suite"). */
const CAUSED_BUG_DAYS = 60;

/** Neighbour bug window, in days (SPEC §6 "Bug voisin"). */
const NEIGHBOR_DAYS = 30;

/** Clock tolerance so a bug of the closure day itself is inside the window. */
const SAME_DAY_TOLERANCE_MS = DAY_MS;

/** Statuses that mean the ticket was given up (SPEC §6 "Abandon"). */
export const ABANDON_STATUSES: readonly string[] = [
  'Cancelled',
  'Canceled',
  'Annulé',
  'Annulee',
  'Abandonné',
  'Abandonned',
  'Abandoned',
  'Rejeté',
  'Rejected',
];

/** Statuses that mean the work is done (SPEC §6). */
export const DONE_STATUSES: readonly string[] = [
  'Done',
  'Closed',
  'Clos',
  'Fermé',
  'Résolu',
  'Resolu',
  'Terminé',
  'Termine',
];

/** Statuses that mean the work has not started yet (SPEC §6 "Délai"). */
export const NOT_STARTED_STATUSES: readonly string[] = [
  'À faire',
  'A faire',
  'To Do',
  'Backlog',
  'Open',
  'Ouvert',
  'Nouveau',
  'New',
  'Triage',
];

/** Two status names, compared without case nor surrounding spaces. */
function sameStatus(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** True when the status is one of the waiting statuses of the project. */
function isWaiting(status: string, waiting: readonly string[]): boolean {
  return waiting.some(name => sameStatus(name, status));
}

/** True when the status is a done status of the project. */
function isDone(status: string, history: StatusHistory): boolean {
  return (
    (history.closedStatus !== '' && sameStatus(status, history.closedStatus)) ||
    DONE_STATUSES.some(name => sameStatus(name, status))
  );
}

/** True when the status is an abandonment status (SPEC §6 "Abandon"). */
function isAbandon(status: string): boolean {
  return ABANDON_STATUSES.some(name => sameStatus(name, status));
}

/** True when the status means the work is under way (SPEC §6 "Délai"). */
function isInProgress(status: string, history: StatusHistory, waiting: readonly string[]): boolean {
  if (isWaiting(status, waiting)) return false;
  if (isDone(status, history)) return false;
  if (isAbandon(status)) return false;
  return !NOT_STARTED_STATUSES.some(name => sameStatus(name, status));
}

/** A date in milliseconds, or null when it cannot be read. */
function atMs(date: string): number | null {
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? ms : null;
}

/** True when the date falls inside the window opening at the anchor. */
function insideWindow(date: string, anchor: number, days: number): boolean {
  const ms = atMs(date);
  if (ms === null) return false;
  const delta = ms - anchor;
  return delta >= -SAME_DAY_TOLERANCE_MS && delta <= days * DAY_MS;
}

/** The last change of the history, or null when the history is empty. */
function lastChange(history: StatusHistory): StatusChange | null {
  return history.changes.length === 0 ? null : history.changes[history.changes.length - 1] ?? null;
}

/** The date of the closure that ended the ticket; empty while it is open. */
export function closureAt(history: StatusHistory): string {
  if (!history.closed) return '';
  for (let i = history.changes.length - 1; i >= 0; i--) {
    const change = history.changes[i];
    if (change !== undefined && isDone(change.to, history)) return change.at;
  }
  return lastChange(history)?.at ?? '';
}

/** The date of the first closure; empty when the ticket never closed. */
export function firstClosureAt(history: StatusHistory): string {
  for (const change of history.changes) {
    if (isDone(change.to, history)) return change.at;
  }
  return '';
}

/**
 * The delay in hours, from the first passage to an "in progress" status to the
 * closure, with the waiting statuses taken out (SPEC §6 "Délai", DP-04).
 * 0 when the ticket is still open or never started.
 */
export function leadTimeHours(history: StatusHistory, waiting: readonly string[]): number {
  const changes = history.changes;
  const start = changes.findIndex(change => isInProgress(change.to, history, waiting));
  if (start < 0) return 0;
  const endMs = atMs(closureAt(history));
  const startMs = atMs(changes[start]?.at ?? '');
  if (endMs === null || startMs === null || endMs <= startMs) return 0;
  let hours = 0;
  for (let i = start; i < changes.length; i++) {
    const from = atMs(changes[i]?.at ?? '');
    const next = i + 1 < changes.length ? atMs(changes[i + 1]?.at ?? '') : null;
    if (from === null) continue;
    const to = Math.min(next ?? endMs, endMs);
    const span = (to - from) / 3_600_000;
    if (span <= 0) continue;
    if (!isWaiting(changes[i]?.to ?? '', waiting)) hours += span;
  }
  return Math.round(hours * 100) / 100;
}

/** True when the reopening counts: not administrative, at least ten minutes. */
function countsAsReopening(reopening: ReopeningFact, anchor: number): boolean {
  if (!reopening.counts) return false;
  if (reopening.durationMin < 10) return false;
  const ms = atMs(reopening.reopenedAt);
  return ms !== null && insideWindow(reopening.reopenedAt, anchor, REOPENING_DAYS);
}

/**
 * True when the ticket was reopened inside the thirty days that follow the
 * closure, administrative reopenings set aside (SPEC §6, DP-04, recipe 4).
 *
 * `closedAt` is the closure the reopening came after: the first one.
 */
export function hadReopening(reopenings: readonly ReopeningFact[], closedAt: string): boolean {
  const anchor = atMs(closedAt);
  if (anchor === null) return false;
  return reopenings.some(reopening => countsAsReopening(reopening, anchor));
}

/** True when the link is a bug caused by the ticket (SPEC §6 "Bug à la suite"). */
function isFollowUpBug(link: IssueLink): boolean {
  return link.linkedIsBug && (link.type === 'caused-by' || link.type === 'causes');
}

/**
 * The bugs linked by an "is caused by" link inside the sixty days that follow
 * the closure (SPEC §6 "Bug à la suite", DP-04).
 */
export function countCausedBugs(links: readonly IssueLink[], closedAt: string): number {
  const anchor = atMs(closedAt);
  if (anchor === null) return 0;
  return links.filter(
    link => isFollowUpBug(link) && insideWindow(link.createdAt, anchor, CAUSED_BUG_DAYS),
  ).length;
}

/** The incidents linked to the ticket (SPEC §6 "Incident"). */
export function countIncidents(links: readonly IssueLink[]): number {
  return links.filter(link => link.linkedIsIncident).length;
}

/** The incidents linked inside the window of the clean closure (SPEC §6). */
function countRecentIncidents(links: readonly IssueLink[], closedAt: string): number {
  const anchor = atMs(closedAt);
  if (anchor === null) return 0;
  return links.filter(
    link => link.linkedIsIncident && insideWindow(link.createdAt, anchor, CAUSED_BUG_DAYS),
  ).length;
}

/**
 * The neighbour bugs: created inside the thirty days that follow the closure,
 * on the same component and quoting the ticket (SPEC §6 "Bug voisin").
 *
 * A weak signal, shown apart, never inside the clean closure.
 */
export function countNeighborBugs(
  neighbors: readonly NeighborBugFact[],
  closedAt: string,
): number {
  const anchor = atMs(closedAt);
  if (anchor === null) return 0;
  return neighbors.filter(neighbor => insideWindow(neighbor.createdAt, anchor, NEIGHBOR_DAYS))
    .length;
}

/** True when the ticket was cancelled after it had started (SPEC §6 "Abandon"). */
export function isAbandoned(history: StatusHistory, waiting: readonly string[] = []): boolean {
  const last = lastChange(history);
  if (last === null || !isAbandon(last.to)) return false;
  return history.changes.some(change => isInProgress(change.to, history, waiting));
}

/**
 * True when the work started autonomous and ended driven, assisted or human:
 * the human takeover. Only a boolean is rendered, never a person
 * (SPEC §6 "Reprise humaine", SPEC §7 rule 8, DP-17).
 */
export function detectTakeover(declarations: readonly Involvement[]): boolean {
  const first = declarations[0];
  const last = declarations[declarations.length - 1];
  if (first === undefined || last === undefined) return false;
  return first.level === 'autonomous' && last.level !== 'autonomous';
}

/**
 * Closed without a reopening, without a following bug and without an incident
 * inside the window (SPEC §6 "Clôture propre", DP-04, recipe 4).
 *
 * The incidents passed here are the ones inside the sixty days that follow the
 * closure. The neighbour bugs never enter this test (SPEC §6).
 */
export function isClean(reopened: boolean, causedBugs: number, incidents: number): boolean {
  return !reopened && causedBugs === 0 && incidents === 0;
}

/** One ticket with its links, to measure how much the team links its bugs (SPEC §21). */
export interface TicketLinks {
  issueId: string;
  links: readonly IssueLink[];
}

/**
 * The coverage indicator of SPEC §21: a team that never links its bugs leaves
 * the clean closure resting on the reopenings and the incidents only, and the
 * coverage screen says so.
 */
export interface LinkCoverage {
  /** Tickets carrying at least one causal link. */
  linked: number;
  /** Tickets considered. */
  total: number;
  /** Share in [0, 1]; null when there is no ticket. */
  rate: number | null;
}

/** True when the link expresses a causality between the two tickets. */
function isCausal(link: IssueLink): boolean {
  return link.type === 'caused-by' || link.type === 'causes';
}

/** The share of tickets the team links causally (SPEC §21, coverage screen). */
export function linkCoverage(tickets: readonly TicketLinks[]): LinkCoverage {
  const linked = tickets.filter(ticket => ticket.links.some(isCausal)).length;
  const total = tickets.length;
  return { linked, total, rate: total === 0 ? null : linked / total };
}

/** The date at which the ticket became judgeable (SPEC §6, recipe 5). */
function matureAt(closedAt: string): string {
  const anchor = atMs(closedAt);
  if (anchor === null) return '';
  return new Date(anchor + CAUSED_BUG_DAYS * DAY_MS).toISOString();
}

/**
 * Everything that happened to the ticket afterwards (SPEC §6, DP-04).
 *
 * `neighborBugs` stays 0 and `takeover` stays false: the frozen signature
 * carries neither the neighbour facts nor the involvement declarations, so the
 * caller renders them apart with `countNeighborBugs` and `detectTakeover`.
 */
export function computeOutcome(
  issueId: string,
  history: StatusHistory,
  links: readonly IssueLink[],
  reopenings: readonly ReopeningFact[],
  waiting: readonly string[],
): Outcome {
  const closedAt = closureAt(history);
  const anchor = firstClosureAt(history) === '' ? closedAt : firstClosureAt(history);
  const reopened = hadReopening(reopenings, anchor);
  const causedBugs = countCausedBugs(links, closedAt);
  return {
    issueId,
    closedAt,
    leadTimeH: leadTimeHours(history, waiting),
    reopened,
    causedBugs,
    neighborBugs: 0,
    incidents: countIncidents(links),
    takeover: false,
    abandoned: isAbandoned(history, waiting),
    clean: closedAt !== '' && isClean(reopened, causedBugs, countRecentIncidents(links, closedAt)),
    matureAt: matureAt(closedAt),
  };
}