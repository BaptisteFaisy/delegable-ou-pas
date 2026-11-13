/**
 * The freshness contract of the data, as a screen shows it (SPEC §17, §19;
 * DP-19, recipe 15).
 *
 * Why: the app reads the graph on behalf of a signed-in user, in slices,
 * during a session. The numbers are only as good as the slice behind them. A
 * freshness contract says, per object type, when the last read happened, how
 * old that read may be, and what to do about it — so "we don't know" is never
 * silently confused with "we haven't looked".
 *
 * The viewmodel computes nothing: `src/domain/freshness.ts` owns the states,
 * the age in minutes and the collection budget. This module only projects them.
 *
 * Pure module: no `@forge/*`, no clock — `now` is given.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { FreshnessContract, FreshnessState } from '../domain/freshness.js';
import { assessFreshness, collectionBudget, stateOf } from '../domain/freshness.js';
import type { Bilingual } from './common.js';

/** The title of the screen, in both languages (SPEC §16). */
const TITLE: Bilingual = {
  fr: 'Le contrat de fraîcheur',
  en: 'The freshness contract',
};

/** The four states of a read, in both languages. */
const STATE_LABELS: Readonly<Record<FreshnessState, Bilingual>> = {
  fresh: { fr: 'à jour', en: 'fresh' },
  stale: { fr: 'périmée', en: 'stale' },
  missing: { fr: 'absente', en: 'missing' },
  unknown: { fr: 'inconnue', en: 'unknown' },
};

/** The overall verdicts, in both languages. */
const OVERALL_LABELS: Readonly<Record<'ok' | 'degraded' | 'blocked', Bilingual>> = {
  ok: { fr: 'Toutes les lectures sont à jour', en: 'Every read is fresh' },
  degraded: { fr: 'Une lecture est périmée', en: 'One read is stale' },
  blocked: { fr: 'Une lecture est absente', en: 'One read is missing' },
};

/** One object type, ready to be rendered. */
export interface FreshnessLine {
  /** The object the right covers. */
  readonly object: string;
  /** The state of that read, against the injected clock. */
  readonly state: FreshnessState;
  /** The state, in both languages. */
  readonly stateLabel: Bilingual;
  /** The age of the last read, in minutes, or `null` when it never happened. */
  readonly ageMinutes: number | null;
  /** How old a read may be, in minutes. */
  readonly maxAgeMinutes: number;
  /** When the last successful read happened, or `null`. */
  readonly lastCollectedAt: string | null;
}

/** The freshness picture, ready to be rendered. */
export interface FreshnessView {
  readonly title: Bilingual;
  /** The overall verdict, in both languages. */
  readonly overall: Bilingual;
  /** How many object types are fresh. */
  readonly fresh: number;
  /** How many are stale. */
  readonly stale: number;
  /** How many are missing. */
  readonly missing: number;
  /** How many are unknown. */
  readonly unknown: number;
  /** One line per object type, in the order of the contracts. */
  readonly lines: readonly FreshnessLine[];
  /** The actions to take, as the domain words them. */
  readonly nextActions: readonly string[];
  /** The summary of the domain, in both languages. */
  readonly note: Bilingual;
  /** The collection a budget of minutes pays for, or `null` when no budget. */
  readonly budget: readonly string[] | null;
}

/**
 * Projects the freshness contract of the data.
 *
 * An empty list of contracts renders an empty picture — never a fabricated
 * "everything is fresh" (SPEC §20).
 */
export function freshnessView(
  contracts: readonly FreshnessContract[],
  now: string,
  budgetMinutes?: number,
): FreshnessView {
  const report = assessFreshness(contracts, now);
  const budget = budgetMinutes === undefined
    ? null
    : collectionBudget(contracts, now, budgetMinutes).objects;
  return {
    title: TITLE,
    overall: OVERALL_LABELS[report.overall],
    fresh: report.fresh,
    stale: report.stale,
    missing: report.missing,
    unknown: report.unknown,
    lines: contracts.map((contract) => line(contract, now)),
    nextActions: report.nextActions,
    note: report.note,
    budget,
  };
}

/** One object type, rendered: its state, its age and its limit. */
function line(contract: FreshnessContract, now: string): FreshnessLine {
  const state = stateOf(contract, now);
  const age = contract.lastCollectedAt === null
    ? null
    : Math.max(0, Math.floor((Date.parse(now) - Date.parse(contract.lastCollectedAt)) / 60000));
  return {
    object: contract.object,
    state,
    stateLabel: STATE_LABELS[state],
    ageMinutes: Number.isFinite(age) ? age : null,
    maxAgeMinutes: contract.maxAgeMinutes,
    lastCollectedAt: contract.lastCollectedAt,
  };
}
