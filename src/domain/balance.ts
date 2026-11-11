/**
 * Balance of the two arms: the composition of the "with agent" arm is compared
 * with the composition of the "without agent" arm, and an alert forbids any
 * conclusion as soon as one difference goes past a tunable tolerance.
 *
 * Realises SPEC §7 rule 5 (unbalanced arms: the app says so and does not
 * conclude), SPEC §21 ("the cohort where everything is now handed to agents":
 * caught by the volume criterion; "no human arm left": unbalanced, and the app
 * points to the previous epoch and to the controlled trial).
 * DP-10, recipe 7.
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock.
 */

import type { Balance, BalanceCriterion, BalanceSignal, Nature, Size } from '../types.js';
import { BALANCE_CRITERIA } from '../types.js';
import { share } from './stats.js';

/** Tolerance on a composition difference before the arms are called unbalanced. */
export const DEFAULT_BALANCE_TOLERANCE: number = 0.2;

/** What one arm is made of: its volume, its sizes, its natures (SPEC §7 rule 5). */
export interface ArmComposition {
  readonly total: number;
  readonly sizes: Readonly<Record<Size, number>>;
  readonly natures: Readonly<Record<Nature, number>>;
}

/** The balance verdict, plus the criteria that triggered the alert (for display). */
export interface BalanceReport {
  readonly balance: Balance;
  readonly triggered: readonly BalanceCriterion[];
}

/** Counts per category of one arm, as a plain record. */
type Counts = Readonly<Record<string, number>>;

/** Builds the composition of one arm; the total is given, categories are copied. */
export function composition(
  n: number,
  sizes: Readonly<Record<Size, number>>,
  natures: Readonly<Record<Nature, number>>,
): ArmComposition {
  return { total: n, sizes: { ...sizes }, natures: { ...natures } };
}

/** Counts of one arm for a mix criterion. */
function countsOf(arm: ArmComposition, criterion: BalanceCriterion): Counts {
  return criterion === 'size-mix' ? arm.sizes : arm.natures;
}

/**
 * One signal per category of a mix criterion: the share of that category in
 * each arm, and the absolute difference between the two shares.
 * An empty arm has no composition to compare, so it renders nothing.
 */
function mixSignals(
  criterion: BalanceCriterion,
  agent: ArmComposition,
  human: ArmComposition,
): BalanceSignal[] {
  if (agent.total <= 0 || human.total <= 0) return [];
  const agentCounts = countsOf(agent, criterion);
  const humanCounts = countsOf(human, criterion);
  const categories = [...new Set([...Object.keys(agentCounts), ...Object.keys(humanCounts)])].sort();
  return categories.map((category) => {
    const agentShare = share(agentCounts[category] ?? 0, agent.total);
    const humanShare = share(humanCounts[category] ?? 0, human.total);
    return {
      criterion,
      agentShare,
      humanShare,
      difference: Math.abs(agentShare - humanShare),
    };
  });
}

/**
 * Volume criterion: each arm measured against the largest one, so the
 * difference is `|agent - human| / max(agent, human)` (SPEC §7 rule 5).
 * Two empty arms are not a volume gap: there is nothing to compare.
 */
function volumeSignal(agent: ArmComposition, human: ArmComposition): BalanceSignal {
  const largest = Math.max(agent.total, human.total);
  const agentShare = share(agent.total, largest);
  const humanShare = share(human.total, largest);
  return {
    criterion: 'volume-gap',
    agentShare,
    humanShare,
    difference: Math.abs(agentShare - humanShare),
  };
}

/** Every composition difference between the two arms, criteria in SPEC order. */
function allSignals(agent: ArmComposition, human: ArmComposition): BalanceSignal[] {
  return [
    ...mixSignals('size-mix', agent, human),
    ...mixSignals('nature-mix', agent, human),
    volumeSignal(agent, human),
  ];
}

/**
 * Compares the two arms and reports the alert (DP-10, recipe 7).
 *
 * `triggered` lists the criteria that went past the tolerance, so a screen can
 * say which one; `balance.balanced` is false as soon as one of them did, and
 * `conclude` then refuses to conclude (SPEC §7 rule 5).
 */
export function compareBalanceDetailed(
  agent: ArmComposition,
  human: ArmComposition,
  tolerance: number = DEFAULT_BALANCE_TOLERANCE,
): BalanceReport {
  const signals = allSignals(agent, human);
  const triggered = BALANCE_CRITERIA.filter((criterion) =>
    signals.some((signal) => signal.criterion === criterion && signal.difference > tolerance),
  );
  return { balance: { balanced: triggered.length === 0, signals }, triggered };
}

/** Frozen entry point: the verdict alone, with all the measured differences. */
export function compareBalance(
  agent: ArmComposition,
  human: ArmComposition,
  tolerance: number = DEFAULT_BALANCE_TOLERANCE,
): Balance {
  return compareBalanceDetailed(agent, human, tolerance).balance;
}
