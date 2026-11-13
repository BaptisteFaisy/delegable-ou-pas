/**
 * The freshness contract of the data the app computed on.
 *
 * Why: the app reads the graph on behalf of a signed-in user, in slices,
 * during a session. The numbers are only as good as the slice behind them. A
 * freshness contract says, per object type, when the last read happened, how
 * old that read may be, and what to do about it — so "we don't know" is never
 * silently confused with "we haven't looked" (SPEC §17, §19, DP-19, recipe 15).
 *
 * The domain is pure: no `@forge/*`, no network, no clock — `now` is given.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** What one object type owes us, freshness-wise. */
export interface FreshnessContract {
  /** The object the right covers ('commit', 'pull-request', 'user', 'issue'). */
  readonly object: string;
  /** When the last successful read happened, or null if never read. */
  readonly lastCollectedAt: string | null;
  /** How old a read may be, in minutes, before it is stale. */
  readonly maxAgeMinutes: number;
  /** Whether the right is granted and whether anything was probed. */
  readonly granted: boolean;
  readonly probed: boolean;
  /** What the state means, in both languages. */
  readonly note: { readonly fr: string; readonly en: string };
}

/** The verdict of one object type. */
export type FreshnessState = 'fresh' | 'stale' | 'missing' | 'unknown';

/** The whole picture, with the three worst-hit objects and the next actions. */
export interface FreshnessReport {
  readonly contracts: readonly FreshnessContract[];
  readonly fresh: number;
  readonly stale: number;
  readonly missing: number;
  readonly unknown: number;
  readonly overall: 'ok' | 'degraded' | 'blocked';
  readonly nextActions: readonly string[];
  readonly note: { readonly fr: string; readonly en: string };
}

/**
 * The state of one object type, against the injected clock.
 *
 * `missing` and `unknown` are deliberately distinct: `missing` means "we have
 * not read anything", `unknown` means "we cannot tell" (right not probed).
 */
export function stateOf(contract: FreshnessContract, now: string): FreshnessState {
  if (!contract.probed) return 'unknown';
  if (!contract.granted) return 'missing';
  if (contract.lastCollectedAt === null) return 'missing';
  const age = ageMinutes(contract.lastCollectedAt, now);
  if (age === null) return 'unknown';
  return age <= contract.maxAgeMinutes ? 'fresh' : 'stale';
}

/** Minutes between two ISO timestamps, or null when a date does not parse. */
export function ageMinutes(from: string, to: string): number | null {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
  return Math.max(0, Math.floor((toMs - fromMs) / 60000));
}

/** The report across all object types, with the actions to take. */
export function assessFreshness(contracts: readonly FreshnessContract[], now: string): FreshnessReport {
  const states = contracts.map((contract) => ({
    contract,
    state: stateOf(contract, now),
  }));
  const fresh = states.filter((item) => item.state === 'fresh').length;
  const stale = states.filter((item) => item.state === 'stale').length;
  const missing = states.filter((item) => item.state === 'missing').length;
  const unknown = states.filter((item) => item.state === 'unknown').length;
  const overall: FreshnessReport['overall'] = stale > 0 ? 'degraded' : (missing > 0 ? 'blocked' : 'ok');
  return {
    contracts,
    fresh,
    stale,
    missing,
    unknown,
    overall,
    nextActions: states
      .filter((item) => item.state !== 'fresh')
      .map((item) => actionFor(item.contract, item.state)),
    note: {
      fr: overall === 'ok'
        ? 'Toutes les lectures sont à jour : les chiffres reposent sur les données annoncées.'
        : 'Tout ou partie des lectures est périmée ou absente : les chiffres qui en dépendent sont les derniers calculés, pas les derniers possibles.',
      en: overall === 'ok'
        ? 'Every read is fresh: the figures rest on the data they claim.'
        : 'Some reads are stale or missing: the figures that depend on them are the last computed, not the last possible.',
    },
  };
}

function actionFor(contract: FreshnessContract, state: FreshnessState): string {
  const object = contract.object;
  if (state === 'missing') return `Collecter les ${object} : aucune lecture.`;
  if (state === 'unknown') return `Sonder le droit sur ${object} : statut inconnu.`;
  const age = contract.lastCollectedAt ? `${contract.lastCollectedAt.slice(11, 16)}` : '?';
  return `Collecter les ${object} : périmés depuis ${age} (limite ${contract.maxAgeMinutes} min).`;
}

/** What a session budget of collection buys, and in which order. */
export interface CollectionBudget {
  readonly tickets: number;
  readonly minutes: number;
  readonly objects: readonly string[];
}

/**
 * The collection a budget of `minutes` pays for, serving the stalest objects
 * first. One ticket is read per minute (SPEC §17: a slice, not a quota).
 */
export function collectionBudget(
  contracts: readonly FreshnessContract[],
  now: string,
  minutes: number,
): CollectionBudget {
  const ordered = [...contracts]
    .map((contract) => ({ contract, state: stateOf(contract, now) }))
    .filter((item) => item.state !== 'fresh')
    .sort((a, b) => priority(b.state) - priority(a.state));
  return {
    tickets: Math.max(0, minutes),
    minutes,
    objects: ordered
      .slice(0, Math.max(1, minutes))
      .map((item) => item.contract.object),
  };
}

function priority(state: FreshnessState): number {
  if (state === 'missing') return 3;
  if (state === 'stale') return 2;
  if (state === 'unknown') return 1;
  return 0;
}