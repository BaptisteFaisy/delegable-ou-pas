/**
 * Status history of a Jira ticket (SPEC §6 "Délai", "Réouverture", "Abandon",
 * SPEC §17 "Historique Jira", DP-04).
 *
 * Nothing is computed here: raw status changes (`from`/`to`/`at`) and the
 * current done-state are handed to the domain (`src/domain/outcome.ts`), which
 * derives the clean closure, the delay and the reopening. A missing field is
 * normal (`''` / `[]`), never an exception (SPEC §20).
 *
 * Pure module. Rule: files < 500 lines, functions < 50 lines.
 */
import type { StatusChange, StatusHistory } from '../types-graph.js';
import { DONE_STATUSES } from '../domain/outcome.js';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** One changelog entry → a `StatusChange`, only when it changes the status. */
function toStatusChange(entry: unknown): StatusChange | null {
  if (entry === null || typeof entry !== 'object') return null;
  const created = (entry as { created?: unknown }).created;
  const items = (entry as { items?: unknown }).items;
  if (typeof created !== 'string' || !Array.isArray(items)) return null;
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;
    const field = (item as { field?: unknown }).field;
    if (text(field).toLowerCase() !== 'status') continue;
    const from = text((item as { fromString?: unknown }).fromString);
    const to = text((item as { toString?: unknown }).toString);
    if (from === '' && to === '') continue;
    return { from, to, at: created };
  }
  return null;
}

/**
 * A changelog body → the status changes, oldest first.
 *
 * Accepts both the v3 shape (`values`) and the v2 shape (`histories`), because
 * the app reads whichever the running Jira returns (SPEC §20 tolerance).
 */
export function parseStatusChanges(changelog: unknown): StatusChange[] {
  if (changelog === null || typeof changelog !== 'object') return [];
  const source = changelog as { values?: unknown; histories?: unknown };
  const list = Array.isArray(source.values)
    ? source.values
    : Array.isArray(source.histories)
      ? source.histories
      : [];
  const changes: StatusChange[] = [];
  for (const entry of list) {
    const change = toStatusChange(entry);
    if (change !== null) changes.push(change);
  }
  return changes.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Current status of a ticket (`fields.status`), as a string. */
export function parseCurrentStatus(issue: unknown): string {
  if (issue === null || typeof issue !== 'object') return '';
  const fields = (issue as { fields?: unknown }).fields;
  if (fields === null || typeof fields !== 'object') return '';
  const status = (fields as Record<string, unknown>)['status'];
  if (status !== null && typeof status === 'object') {
    const name = (status as { name?: unknown }).name;
    if (typeof name === 'string') return name;
  }
  return typeof status === 'string' ? status : '';
}

/** True when the status is a terminal one (SPEC §6, reuses the domain list). */
export function isDoneStatus(status: string): boolean {
  const candidate = status.trim().toLowerCase();
  return DONE_STATUSES.some((name) => name.trim().toLowerCase() === candidate);
}

/** Assembles the raw `StatusHistory` from the current status and the changelog. */
export function statusHistoryFrom(
  issueId: string,
  currentStatus: string,
  changelog: unknown,
): StatusHistory {
  const closed = isDoneStatus(currentStatus);
  return {
    issueId,
    changes: parseStatusChanges(changelog),
    closed,
    closedStatus: closed ? currentStatus : '',
  };
}