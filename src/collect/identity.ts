/**
 * Robot author recognition (SPEC §5 "source 2", SPEC §7 rule 8, DP-17).
 *
 * No person identifier is ever exposed or rendered: the reader answers only a
 * boolean ("robot or not") from the account id, the display name and the
 * Atlassian account type. The display name is used locally to decide, then
 * dropped — it never leaves the adapter.
 *
 * Pure part: `isRobotAccount`, `accountIsBotAccountType`.
 * Adapter part: `createIdentityReader`, an async, cached reader returning a
 * boolean only (SPEC §18: "aucun nom de personne").
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** Markers of a robot account (git bots, CI, integration assistants). */
const ROBOT_MARKERS: readonly RegExp[] = [
  /\[bot\]/i,
  /\bbot\b/i,
  /(^|[^a-z])automation([^a-z]|$)/i,
  /dependabot/i,
  /renovate/i,
  /github-actions/i,
  /gitlab-ci/i,
  /jenkins/i,
  /\bci[-_]?bot\b/i,
  /codegeist[-_]?agent/i,
];

/** An account with neither id nor name cannot be judged. */
export const NO_ACCOUNT = '';

/** True when the account id or the display name carry an automation marker. */
export function isRobotAccount(accountId: string, displayName: string): boolean {
  return [accountId, displayName].some((value) => ROBOT_MARKERS.some((marker) => marker.test(value)));
}

/** Reads the Atlassian account type off a raw user record (true for `app`/bot). */
export function accountIsBotAccountType(userRecord: unknown): boolean {
  if (userRecord === null || typeof userRecord !== 'object') return false;
  const record = userRecord as Record<string, unknown>;
  // The Teamwork Graph answers with an explicit `isBot` boolean (SPEC §19).
  if (record['isBot'] === true) return true;
  const accountType = typeof record['accountType'] === 'string' ? (record['accountType'] as string) : '';
  if (accountType.toLowerCase() === 'app') return true;
  const legacyType = typeof record['type'] === 'string' ? (record['type'] as string) : '';
  if (legacyType.toLowerCase() === 'app') return true;
  const name = typeof record['displayName'] === 'string' ? (record['displayName'] as string) : '';
  return isRobotAccount('', name);
}

/** Bot detection from a Jira account (id + display name). */
export function authorIsBot(accountId: string, displayName: string): boolean {
  if (accountId === '' && displayName === '') return false;
  return isRobotAccount(accountId, displayName);
}

/** Fetches one user record by account id; `null` when the account is unknown. */
export type UserFetcher = (accountId: string) => Promise<unknown>;

/** The identity reader answers a boolean only, never a person identifier. */
export interface IdentityReader {
  isBot(accountId: string): Promise<boolean>;
}

/**
 * Builds a cached, async identity reader (SPEC §5, source 2). The account id is
 * fetched once, the answer kept as a boolean; the display name is never returned.
 */
export function createIdentityReader(fetchUser: UserFetcher): IdentityReader {
  const cache = new Map<string, boolean>();
  return {
    isBot: async (accountId: string): Promise<boolean> => {
      if (accountId === NO_ACCOUNT) return false;
      const cached = cache.get(accountId);
      if (cached !== undefined) return cached;
      let bot = false;
      try {
        const record = await fetchUser(accountId);
        bot = accountIsBotAccountType(record);
      } catch {
        bot = false;
      }
      cache.set(accountId, bot);
      return bot;
    },
  };
}