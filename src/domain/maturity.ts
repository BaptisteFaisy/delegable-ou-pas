/**
 * Maturity: a ticket closed yesterday is not judgeable yet, it stays out of the
 * rate but stays visible as "not mature yet".
 *
 * Realises SPEC §6 (a reopening is judged after 30 days, a clean closure after
 * 60 days), SPEC §21 ("a ticket still open": never judgeable), SPEC §20
 * (a missing date renders an empty string, never an exception).
 * DP-04, recipe 5.
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network. The clock is
 * injected as an ISO instant by the caller (`now`), never read here; a `Clock`
 * port (`src/ports.ts`) supplies it at runtime.
 */

import type { Outcome } from '../types.js';

/** Days before a reopening can be judged (SPEC §6). */
export const REOPENING_WINDOW_DAYS: number = 30;

/** Days before a clean closure can be judged (SPEC §6). */
export const CLEAN_WINDOW_DAYS: number = 60;

/** How many tickets of a set are judgeable, and how many are still too young. */
export interface MaturitySplit {
  readonly mature: number;
  readonly immature: number;
  readonly total: number;
}

const MS_PER_DAY = 86_400_000;

/** A calendar date without a time part, as written by the Forge. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Reads an ISO instant as milliseconds; `null` when it is missing or unreadable. */
function parseInstant(value: string): number | null {
  const text = value.trim();
  if (text === '') return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Shifts an ISO date by a number of days, in UTC, and renders it back in the
 * shape it came in (a date stays a date, an instant stays an instant).
 * A missing or unreadable date renders an empty string (SPEC §20).
 */
function addDays(value: string, days: number): string {
  const instant = parseInstant(value);
  if (instant === null) return '';
  const shifted = new Date(instant + days * MS_PER_DAY).toISOString();
  return DATE_ONLY.test(value.trim()) ? shifted.slice(0, 10) : shifted;
}

/** Date at which a clean closure becomes judgeable: `closedAt` + 60 days. */
export function maturityDate(closedAt: string): string {
  return addDays(closedAt, CLEAN_WINDOW_DAYS);
}

/**
 * Date at which one ticket becomes judgeable: 30 days after closure when it was
 * reopened, 60 days otherwise (SPEC §6). Empty while the ticket is still open.
 *
 * The date is recomputed here rather than read from `Outcome.matureAt`: one
 * rule, one place, so a stale row cannot change a rate.
 */
export function judgeableAt(outcome: Outcome): string {
  const window = outcome.reopened ? REOPENING_WINDOW_DAYS : CLEAN_WINDOW_DAYS;
  return addDays(outcome.closedAt, window);
}

/**
 * True when the ticket can be judged at `now` (recipe 5).
 * A ticket still open (`closedAt` empty) is never judgeable, and neither is a
 * ticket whose date or whose `now` cannot be read: absence of data is normal.
 */
export function isMature(outcome: Outcome, now: string): boolean {
  const deadline = parseInstant(judgeableAt(outcome));
  const instant = parseInstant(now);
  if (deadline === null || instant === null) return false;
  return instant >= deadline;
}

/** The tickets of a set that may enter a rate at `now`; the others stay visible. */
export function judgeable(outcomes: readonly Outcome[], now: string): readonly Outcome[] {
  return outcomes.filter((outcome) => isMature(outcome, now));
}

/** Both counts of a set at `now`: mature, immature, and the total (recipe 5). */
export function maturitySplit(outcomes: readonly Outcome[], now: string): MaturitySplit {
  const mature = judgeable(outcomes, now).length;
  return { mature, immature: outcomes.length - mature, total: outcomes.length };
}
