/**
 * Screen 6 — the coverage of the data (SPEC §16.6, §19; DP-19, recipe 15).
 *
 * Mute component: it displays the `CoverageView` the viewmodel projected. A
 * missing right is said out loud, never hidden behind a silent zero; the known
 * involvement keeps its sample size and its interval (recipe 10).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Stack, Text } from '@forge/react';
import type { Translate } from '../i18n/index.js';
import type { CoverageView as CoverageViewModel } from '../viewmodel/coverage.js';
import { DemoBanner } from './components/badges.js';
import { KeyValue, SectionTitle } from './components/sections.js';

/** Props of the coverage renderer (frozen contract, docs/CONTRACTS.md §L8). */
export interface CoverageViewProps {
  readonly view: CoverageViewModel;
  readonly t: Translate;
}

/** The coverage screen: known involvement, each right, the last collection. */
export function CoverageView(props: CoverageViewProps) {
  const view = props.view;
  const t = props.t;
  return (
    <Stack space="space.200">
      <DemoBanner notice={view.demo} />
      <SectionTitle title={view.title} />
      <Text>{view.knownLine}</Text>
      {view.partialNotice === null ? null : <Text>{view.partialNotice}</Text>}
      <SectionTitle title={t('coverage.permissions')} />
      {view.permissions.map((permission) => (
        <KeyValue
          key={permission.objectType}
          label={permission.label}
          value={permission.stateLabel}
        />
      ))}
      <Text>{view.lastCollectionLine}</Text>
      <Text>{view.anonymityNotice}</Text>
    </Stack>
  );
}
