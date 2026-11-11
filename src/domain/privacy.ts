/**
 * Privacy of the measures: no statistic per person, a cohort carried by fewer
 * than three people is masked with its reason, and a reusable guard checks that
 * a rendered object carries no person identifier.
 *
 * Realises SPEC §7 rule 8 (no name of a person is ever rendered), SPEC §5 (the
 * "41 % of tickets have an unknown involvement" banner), SPEC §18 (`people_count`
 * is used for nothing but masking), SPEC §20.
 * DP-17, DP-03 (`unknown` never counts in an arm), recipe 11.
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock.
 */

import type { Involvement, ProportionStat } from '../types.js';
import { proportion } from './stats.js';

/** Below this number of people a cohort is masked (SPEC §7 rule 8). */
export const MIN_PEOPLE: number = 3;

/** Why a cohort is masked; the reason is shown, the numbers are not. */
export type MaskReason = 'fewer-than-3-people';

/** The mask verdict of one cohort, with the reason when it is masked. */
export interface CohortMask {
  readonly masked: boolean;
  readonly reason: MaskReason | null;
}

/**
 * Field names that identify a person, normalised (lower case, no separator).
 * Counts and agent names are not here: `reviewerCount`, `agentName` and
 * `peopleCount` are measures, not people. A bare `name` is not listed either —
 * it is ambiguous, the contract vocabulary uses `nature`, `label`, `agentName`;
 * callers extend the list when they render a field of their own.
 */
export const PERSON_IDENTIFIER_FIELDS: readonly string[] = [
  'account',
  'accountid',
  'accountids',
  'actor',
  'actoraccountid',
  'assignee',
  'assigneeaccountid',
  'author',
  'authoraccountid',
  'avatar',
  'avatarurl',
  'displayname',
  'email',
  'emailaddress',
  'firstname',
  'fullname',
  'givenname',
  'lastname',
  'mail',
  'member',
  'members',
  'people',
  'person',
  'personid',
  'personname',
  'profileurl',
  'reporter',
  'reporteraccountid',
  'reviewer',
  'revieweraccountid',
  'reviewers',
  'user',
  'userid',
  'username',
];

/** True when a cohort carried by `peopleCount` people must be masked (recipe 11). */
export function maskCohort(peopleCount: number): boolean {
  return peopleCount < MIN_PEOPLE;
}

/** The mask verdict with its reason: no figure is rendered when it is masked. */
export function cohortMask(peopleCount: number): CohortMask {
  if (maskCohort(peopleCount)) return { masked: true, reason: 'fewer-than-3-people' };
  return { masked: false, reason: null };
}

/**
 * Number of people that may be displayed: `0` when the cohort is masked,
 * because `people_count` serves no other purpose than masking (SPEC §18).
 */
export function reportablePeopleCount(peopleCount: number): number {
  return maskCohort(peopleCount) ? 0 : peopleCount;
}

/**
 * Share of tickets whose involvement is unknown, with its sample size and its
 * interval (SPEC §5 banner, SPEC §7 rule 3). `unknown` never counts in an arm
 * (DP-03): this is the measure of what the app does not know.
 */
export function unknownShare(involvements: readonly Involvement[]): ProportionStat {
  const unknown = involvements.filter((item) => item.level === 'unknown').length;
  return proportion(unknown, involvements.length);
}

/** Normalises a field name so `author_account_id` and `authorAccountId` match. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, '');
}

/** Walks a value and returns the path of the first forbidden field it finds. */
function findLeak(
  value: unknown,
  forbidden: readonly string[],
  path: string,
  seen: Set<object>,
): string | null {
  if (value === null || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return findLeakInList(value, forbidden, path, seen);
  return findLeakInObject(value as Record<string, unknown>, forbidden, path, seen);
}

/** Walks a list; indices are part of the reported path. */
function findLeakInList(
  items: readonly unknown[],
  forbidden: readonly string[],
  path: string,
  seen: Set<object>,
): string | null {
  for (let index = 0; index < items.length; index += 1) {
    const found = findLeak(items[index], forbidden, `${path}[${index}]`, seen);
    if (found !== null) return found;
  }
  return null;
}

/** Walks an object; the first forbidden key wins, depth first. */
function findLeakInObject(
  value: Record<string, unknown>,
  forbidden: readonly string[],
  path: string,
  seen: Set<object>,
): string | null {
  for (const [key, item] of Object.entries(value)) {
    const childPath = path === '' ? key : `${path}.${key}`;
    if (forbidden.includes(normalizeKey(key))) return childPath;
    const found = findLeak(item, forbidden, childPath, seen);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Reusable guard for every rendered object (MCP tools, screens, exports):
 * returns the path of the first person identifier it contains, or `null` when
 * the object is clean (SPEC §7 rule 8, DP-17).
 */
export function personIdentifierLeak(
  value: unknown,
  forbidden: readonly string[] = PERSON_IDENTIFIER_FIELDS,
): string | null {
  return findLeak(value, forbidden.map(normalizeKey), '', new Set<object>());
}

/** True when a rendered object carries no person identifier. */
export function isPersonSafe(value: unknown): boolean {
  return personIdentifierLeak(value) === null;
}
