/**
 * Collection planning: how a slice of the graph is cut and resumed (SPEC §17
 * "Ce qu'impose le graphe", SPEC §19, DP-18).
 *
 * The graph is read on behalf of a signed-in user, so the work is cut into
 * bounded slices and resumed from the last ticket collected. This module is the
 * pure planner; the collector (`graph.ts`) feeds it an ordered, already-windowed
 * candidate list and applies the result. No clock, no network, no randomness.
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { GraphObjectType } from '../types.js';

/** Default slice size: one slice fits in a user session (SPEC §17, DP-18). */
export const DEFAULT_SLICE_SIZE = 25;

/** Upper bound of a slice: the work stays bounded (SPEC §19 "aucune liste sans limite"). */
export const MAX_SLICE_SIZE = 200;

/** The result of planning one slice over an ordered candidate list. */
export interface PlanResult {
  /** The tickets covered by the slice, in order. */
  readonly issueIds: readonly string[];
  /** The last ticket id reached, used as the resume cursor (SPEC §18 `graph_cursor`). */
  readonly lastIssueId: string;
  /** True when the candidates were exhausted; false when a next slice remains. */
  readonly complete: boolean;
}

/** The keys of one slice and whether the candidate list is exhausted. */
export interface SliceKeys {
  readonly keys: readonly string[];
  readonly complete: boolean;
}

/**
 * Clamps a requested slice size into the allowed range (SPEC §19).
 *
 * A non-positive or non-finite size falls back to the default, so a bad job
 * never collects an unbounded list.
 */
export function clampSliceSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_SLICE_SIZE;
  return Math.min(Math.floor(size), MAX_SLICE_SIZE);
}

/**
 * Cuts the next slice out of an ordered candidate list.
 *
 * `fromIssueId` is the resume cursor: when it is present in the window, the slice
 * starts right after it; when the window already excludes it (key-windowed JQL),
 * the whole window is taken. A non-positive `sliceSize` yields an empty, complete
 * slice (nothing to do).
 *
 * The list is exhausted only when the caller fetched at most `sliceSize`
 * candidates (the collector over-fetches by one) and the window fits the slice.
 */
export function planSlice(
  candidates: readonly string[],
  fromIssueId: string,
  sliceSize: number,
): PlanResult {
  if (sliceSize <= 0) {
    return { issueIds: [], lastIssueId: fromIssueId, complete: true };
  }
  const window = candidatesAfterCursor(candidates, fromIssueId);
  const issueIds = window.slice(0, sliceSize);
  const lastIssueId = issueIds.length > 0 ? issueIds[issueIds.length - 1] : fromIssueId;
  const complete = candidates.length <= sliceSize && window.length <= sliceSize;
  return { issueIds, lastIssueId, complete };
}

/** The keys of the next slice, without the cursor bookkeeping (SPEC §17). */
export function sliceKeys(
  candidates: readonly string[],
  fromIssueId: string,
  sliceSize: number,
): SliceKeys {
  const plan = planSlice(candidates, fromIssueId, sliceSize);
  return { keys: [...plan.issueIds], complete: plan.complete };
}

/** The cursor to resume from: the job's cursor wins over the stored one (DP-18). */
export function resumeKey(jobCursor: string, storedCursor: string): string {
  return jobCursor !== '' ? jobCursor : storedCursor;
}

/** Drops the candidates up to and including the cursor (when it is present). */
function candidatesAfterCursor(candidates: readonly string[], fromIssueId: string): readonly string[] {
  if (fromIssueId === '') return candidates;
  const index = candidates.indexOf(fromIssueId);
  return index >= 0 ? candidates.slice(index + 1) : candidates;
}

/** The bounded JQL listing a project's tickets, ordered by key (SPEC §19 "bounded"). */
export function projectJql(projectId: string): string {
  return `project = "${escapeJqlLiteral(projectId)}" ORDER BY key ASC`;
}

/**
 * The bounded JQL resuming after a key, so a session picks up where it stopped
 * (DP-18). Without a key yet, it lists the project from the start.
 */
export function resumeJql(projectId: string, lastKey: string): string {
  if (lastKey === '') return projectJql(projectId);
  return `project = "${escapeJqlLiteral(projectId)}" AND key > "${escapeJqlLiteral(lastKey)}" ORDER BY key ASC`;
}

/** Escapes a value placed inside a double-quoted JQL literal. */
export function escapeJqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** The collection cursor label used in logs, without any person identifier. */
export function sliceLabel(projectId: string, objectType: GraphObjectType): string {
  return `${projectId}:${objectType}`;
}
