/**
 * Screen 7 — "Can this app be believed?" (SPEC §10, §16.7; DP-21, recipe 10).
 *
 * Mute component: it displays the `CalibrationView` the viewmodel projected,
 * one row per recommendation — "we do not know" included, with the same dignity
 * as the others (SPEC §7 rule 4) — and the warning of the head of the page when
 * the advice adds nothing (DP-21).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { SectionMessage, Stack, Text } from '@forge/react';
import type { Translate } from '../i18n/index.js';
import type { CalibrationView as CalibrationViewModel } from '../viewmodel/calibration.js';
import { ColorBadge } from './components/badges.js';
import { Rate } from './components/rate.js';
import { SectionTitle } from './components/sections.js';
import { colorOf } from '../viewmodel/common.js';

/** Props of the calibration renderer (frozen contract, docs/CONTRACTS.md §L8). */
export interface CalibrationViewProps {
  readonly view: CalibrationViewModel;
  readonly t: Translate;
}

/** The calibration screen: the warning up front, then one row per advice. */
export function CalibrationView(props: CalibrationViewProps) {
  const view = props.view;
  const t = props.t;
  return (
    <Stack space="space.200">
      <SectionTitle title={view.title} />
      {view.warning === null ? null : (
        <SectionMessage title={view.title} appearance="warning">{view.warning}</SectionMessage>
      )}
      <Text>{view.intro}</Text>
      {view.rows.map((row) => (
        <Stack key={row.recommendation} space="space.050">
          <ColorBadge color={colorOf(row.recommendation)} label={row.label} />
          {row.clean === null
            ? <Text>{row.line}</Text>
            : <Rate label={row.label} line={row.clean} empty={t('stats.none')} />}
        </Stack>
      ))}
      <Text>{view.anonymityNotice}</Text>
    </Stack>
  );
}
