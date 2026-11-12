/**
 * The small reusable badges (SPEC §12 "La matrice", §13; DP-14, DP-20).
 *
 * A badge lives once and is reused by every screen: the matrix colour, the
 * recommendation lozenge and the permanent demo banner. Mute components: they
 * display the label and the colour the viewmodel chose, they decide nothing.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Lozenge, SectionMessage } from '@forge/react';
import type { MapColor } from '../../types-advice.js';
import type { DemoNotice } from '../../viewmodel/common.js';

/** Lozenge appearance of each matrix colour (SPEC §12). Grey = "we do not know". */
const APPEARANCE_OF: Readonly<Record<MapColor, 'success' | 'new' | 'removed' | 'default'>> = {
  green: 'success',
  orange: 'new',
  red: 'removed',
  grey: 'default',
};

/** Props of the recommendation lozenge. */
export interface ColorBadgeProps {
  readonly color: MapColor;
  readonly label: string;
}

/** The colour of a matrix cell as a lozenge (SPEC §12, DP-14). */
export function ColorBadge(props: ColorBadgeProps) {
  return <Lozenge appearance={APPEARANCE_OF[props.color]} isBold>{props.label}</Lozenge>;
}

/**
 * The permanent demo banner (DP-20): a project on the demonstration dataset is
 * recognisable as such on every screen. `null` renders nothing.
 */
export function DemoBanner(props: { readonly notice: DemoNotice | null }) {
  if (props.notice === null) return null;
  return (
    <SectionMessage title={props.notice.title} appearance="warning">
      {props.notice.text}
    </SectionMessage>
  );
}
