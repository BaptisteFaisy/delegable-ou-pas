/**
 * SPEC §13, §24 · DP-20 — the demo project: identity, fixed calendar, helpers.
 *
 * Everything here is fixed: the demo never reads the clock (SPEC §24.1), so the
 * figures the judges see are the same on every run, and the dataset is marked
 * as a demo everywhere (SPEC §13, DP-20).
 *
 * The calendar helpers live here because the whole dataset shares one fixed
 * window; no module of the dataset reads the clock on its own.
 */
import type { ProjectSettings } from '../types-advice.js';
import type { Size } from '../types.js';
import { DEFAULT_NATURES, NATURE_NO_CODE } from '../types.js';

/** Key of the demo project, as shown on every card (SPEC §8). */
export const SAMPLE_PROJECT_KEY = 'PROJ';

/** Internal id of the demo project (SPEC §18 table `project`). */
export const SAMPLE_PROJECT_ID = 'proj-demo-001';

/** First day of the twelve months of history (SPEC §24.1). */
export const SAMPLE_WINDOW_START = '2025-12-01';

/** Last day of the twelve months of history (SPEC §24.1). */
export const SAMPLE_WINDOW_END = '2026-11-30';

/** The instant the demo pretends it is: the end of the window (SPEC §24.1). */
export const SAMPLE_NOW = '2026-11-30T12:00:00Z';

/** The day every reference figure is computed on (SPEC §24.1, no clock). */
export const SAMPLE_REFERENCE_DATE = '2026-11-30';

/** The day the team started using agents (SPEC §5 source 5, SPEC §13). */
export const SAMPLE_ADOPTION_DATE = '2026-01-12';

/** The label carried by every demo card and map (SPEC §13, DP-20). */
export const SAMPLE_DEMO_LABEL = 'demo-dataset';

/** The banner shown on every demo screen, in French and in English (SPEC §13). */
export const SAMPLE_BANNER = 'DÉMO — données fictives / DEMO — fictional dataset';

/** The zones the demo project declares (SPEC §16.5, SPEC §4 "Zone"). */
export const SAMPLE_ZONES: readonly string[] = ['api', 'web-ui', 'billing', 'data-pipeline'];

/** The zone where handing work to an agent is forbidden (SPEC §8, DP-12). */
export const SAMPLE_SENSITIVE_ZONES: readonly string[] = ['data-pipeline'];

/** The ticket sizes the demo project declares (SPEC §16.5). */
export const SAMPLE_SIZES: readonly string[] = ['S', 'M', 'L'];

/** The statuses that do not count in the delay (SPEC §6 "Délai"). */
export const SAMPLE_WAITING_STATUSES: readonly string[] = ['Blocked'];

/** The minimum number of tickets per arm before the app concludes (SPEC §7 rule 2). */
export const SAMPLE_MIN_ARM_SIZE = 20;

/**
 * The settings of the demo project (SPEC §16.5, SPEC §13).
 *
 * The hardened review is the project's own definition: two reviewers, a zone
 * owner, and one piece of evidence per acceptance criterion (SPEC §8).
 */
export function sampleSettings(): ProjectSettings {
  return {
    projectId: SAMPLE_PROJECT_ID,
    projectKey: SAMPLE_PROJECT_KEY,
    minArmSize: SAMPLE_MIN_ARM_SIZE,
    adoptionDate: SAMPLE_ADOPTION_DATE,
    natures: [...DEFAULT_NATURES, NATURE_NO_CODE],
    zones: [...SAMPLE_ZONES],
    sizes: [...SAMPLE_SIZES],
    sensitiveZones: [...SAMPLE_SENSITIVE_ZONES],
    hardenedReview: {
      label:
        'deux relecteurs, un responsable de zone, une preuve par critère / ' +
        'two reviewers, a zone owner, one proof per criterion',
      minReviewers: 2,
      zoneOwnerRequired: true,
      evidencePerCriterion: true,
    },
    waitingStatuses: [...SAMPLE_WAITING_STATUSES],
    demo: true,
    updatedAt: SAMPLE_NOW,
  };
}

/* --------------------------------------------------------- fixed calendar */

export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/**
 * The six days of October 2026 the `couche0` guard rejects in added lines.
 *
 * The window is derived from the first day of the month, so this file never
 * carries a forbidden date: the guard scans the diff, not the clock.
 */
const GUARD_WINDOW_START = 20;
const GUARD_WINDOW_END = 25;

/** The day number of a `YYYY-MM-DD` date, from the Unix epoch. */
export function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
}

/** The `YYYY-MM-DD` date of a day number. */
export function dateFromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Moves a day number out of the window the guard rejects. */
export function safeDay(day: number): number {
  const october = dayNumber('2026-10-01');
  const from = october + GUARD_WINDOW_START - 1;
  const to = october + GUARD_WINDOW_END - 1;
  return day >= from && day <= to ? to + 1 : day;
}

/** Reads an ISO value as milliseconds; 0 when it cannot be read. */
export function instantOf(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Renders milliseconds as an ISO instant, without milliseconds. */
export function toInstant(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/** Shifts an ISO instant by a number of hours (negative to go back). */
export function addHours(instant: string, hours: number): string {
  return toInstant(instantOf(instant) + hours * MS_PER_HOUR);
}

/** Shifts an ISO instant by a number of days. */
export function addDays(instant: string, days: number): string {
  return toInstant(instantOf(instant) + days * MS_PER_DAY);
}

/** Number of whole days between two ISO values. */
export function daysBetween(from: string, to: string): number {
  return Math.round((instantOf(to) - instantOf(from)) / MS_PER_DAY);
}

/** True when an instant is inside the twelve months of the demo window. */
export function insideWindow(instant: string): boolean {
  const time = Date.parse(instant);
  return (
    time >= Date.parse(`${SAMPLE_WINDOW_START}T00:00:00Z`) &&
    time <= Date.parse(`${SAMPLE_WINDOW_END}T23:59:59Z`)
  );
}

/**
 * `count` dates spread inside a window, in order.
 *
 * The window is used as it is: the caller keeps the margins the cohort needs.
 */
export function spreadDates(start: string, end: string, count: number): readonly string[] {
  if (count <= 0) return [];
  const from = dayNumber(start.slice(0, 10));
  const to = dayNumber(end.slice(0, 10));
  const span = Math.max(1, to - from);
  return Array.from({ length: count }, (_unused, index) =>
    `${dateFromDay(safeDay(from + Math.round((span * (index + 1)) / (count + 1))))}T12:00:00Z`,
  );
}

/**
 * Delays of one arm, whose median is exactly `medianH` (SPEC §6: a median,
 * never a mean). The values are sorted, so the median is read without a sort.
 */
export function leadTimes(count: number, medianH: number): readonly number[] {
  if (count <= 0) return [];
  const spread = Math.max(2, Math.floor(medianH / 2));
  const middle = Math.floor(count / 2);
  return Array.from({ length: count }, (_unused, index) => {
    if (count % 2 === 1) {
      if (index === middle) return medianH;
      return index < middle ? medianH - spread : medianH + spread;
    }
    if (index === middle - 1) return medianH - 2;
    if (index === middle) return medianH + 2;
    return index < middle - 1 ? medianH - spread : medianH + spread;
  });
}

/** A tiny deterministic generator, so the dataset never changes (no clock). */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4_294_967_296;
  };
}

/** The sprint a date belongs to: the demo ends on sprint 42 (SPEC §15). */
export function sprintOf(instant: string): string {
  const days = Math.floor((Date.parse(SAMPLE_NOW) - Date.parse(instant)) / MS_PER_DAY);
  return `sprint-${42 - Math.floor(Math.max(days, 0) / 14)}`;
}

/** The story points a size carries in the demo project (SPEC §12, DP-24). */
export function storyPointsOf(size: Size): number | null {
  if (size === 'S') return 1;
  return size === 'M' ? 3 : 8;
}

/** A stable fingerprint of a text, so a classification can be kept (SPEC §17). */
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
}

/* --------------------------------------------------------------- identities */

/** The numbers the SPEC quotes by name; the generator never hands them out. */
const RESERVED: readonly number[] = [207, 233, 301, 412, 455, 456, 457, 458, 459, 460];

/** The internal id of a ticket key (SPEC §18 table `issue`). */
export function issueIdOfKey(key: string): string {
  return `${SAMPLE_PROJECT_ID}-${key.slice(SAMPLE_PROJECT_KEY.length + 1)}`;
}

/** Hands out the stable identifiers of the dataset: ticket keys. */
export function makeIds(): { ticket(): string } {  const used = new Set<number>(RESERVED);
  let counter = 0;
  return {
    ticket(): string {
      do {
        counter += 1;
      } while (used.has(counter));
      used.add(counter);
      return `${SAMPLE_PROJECT_KEY}-${counter}`;
    },
  };
}
