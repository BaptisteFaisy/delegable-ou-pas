/**
 * The single rate renderer of the app (SPEC §7 rule 3, §20; DP-08, recipe 10).
 *
 * Recipe 10 is enforced here and nowhere else: a rate is rendered with its
 * sample size and its interval, always together. Every screen shows a rate
 * through this component, fed by the viewmodel `rateLine` — the one formatter —
 * so no screen can display a bare "83 %". An empty arm renders the explicit
 * "no ticket" sentence, never a zero (SPEC §20).
 *
 * Mute component: it displays the `RateLine` it is given, it decides nothing.
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Inline, Text } from '@forge/react';
import type { RateLine } from '../../viewmodel/common.js';

/** Props of the single rate renderer. */
export interface RateProps {
  /** The label in front of the figure, e.g. "With an agent". */
  readonly label: string;
  /** The three parts of recipe 10, produced by the viewmodel `rateLine`. */
  readonly line: RateLine | null;
  /** The explicit sentence for an absent arm, produced by the viewmodel. */
  readonly empty: string;
}

/**
 * Renders a rate with its sample size and its interval. The three elements are
 * separate text nodes so a test can assert each one is present (recipe 10).
 */
export function Rate(props: RateProps) {
  if (props.line === null) {
    return (
      <Inline space="space.100">
        <Text>{props.label}</Text>
        <Text>{props.empty}</Text>
      </Inline>
    );
  }
  return (
    <Inline space="space.100">
      <Text>{props.label}</Text>
      <Text>{props.line.rate}</Text>
      <Text>{props.line.sample}</Text>
      <Text>{props.line.interval}</Text>
    </Inline>
  );
}
