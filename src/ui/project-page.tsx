/**
 * Screen 2 — the delegation map of the project (SPEC §12, §16.2; DP-14, DP-17,
 * DP-19, DP-21, DP-22, DP-24).
 *
 * The mute renderer displays the `MapView` the viewmodel projected; the screen
 * container fetches the DOMAIN data from the unique resolver and runs the
 * projections with the translator of the user's locale. The coverage (screen 6)
 * and the calibration (screen 7) are views of this page, as the manifest says.
 *
 * A total is never shown alone: the grey share and the delegable share sit next
 * to the matrix that decomposes them (SPEC §7 rule 7). Deviations are counts and
 * cohorts, never a person (DP-17).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { useState } from 'react';
import { Stack, Text } from '@forge/react';
import type { Translate } from '../i18n/index.js';
import type { Calibration, Coverage, DelegationMap } from '../types-advice.js';
import { mapView, type MapCellView, type MapView } from '../viewmodel/delegation-map.js';
import { coverageView } from '../viewmodel/coverage.js';
import { calibrationView } from '../viewmodel/calibration.js';
import { DemoBanner } from './components/badges.js';
import { RESOLVER_METHOD, usePayload } from './components/data.js';
import { BulletList, SectionTitle } from './components/sections.js';
import { DelegationMatrix } from './matrix.js';
import { CohortScreen } from './cohort.js';
import { CoverageView } from './coverage.js';
import { CalibrationView } from './calibration.js';

/** What the resolver of the project page answers: domain data, never a view. */
export interface ProjectPagePayload {
  readonly map: DelegationMap | null;
  readonly coverage: Coverage | null;
  readonly calibrationRows: readonly Calibration[];
  readonly adviceAddsNothing: boolean;
}

/** Props of the map renderer (frozen contract, docs/CONTRACTS.md §L8). */
export interface DelegationMapViewProps {
  readonly view: MapView;
  readonly t: Translate;
  readonly onOpenCohort: (cell: MapCellView) => void;
}

/** The map: epochs, shares, the matrix and the deviations (SPEC §16.2). */
export function DelegationMapView(props: DelegationMapViewProps) {
  const view = props.view;
  return (
    <Stack space="space.200">
      <DemoBanner notice={view.demo} />
      <Text>{view.epochLine}</Text>
      <Text>{view.greyShareLine}</Text>
      <Text>{view.delegableShareLine}</Text>
      <DelegationMatrix view={view} t={props.t} onOpenCohort={props.onOpenCohort} />
      <SectionTitle title={props.t('ui.deviations.title')} />
      <BulletList items={view.deviations} />
    </Stack>
  );
}

/** The cell whose cohort is open, so the cohort screen knows what to ask. */
export interface SelectedCell {
  readonly nature: string;
  readonly zone: string;
  readonly size: string | null;
}

/** The project page: the map, the cohort of the clicked cell, coverage and calibration. */
export function ProjectPageScreen(props: { readonly t: Translate }) {
  const payload = usePayload<ProjectPagePayload>(RESOLVER_METHOD.projectPage);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const t = props.t;
  if (payload.loading) return <Text>{t('ui.loading')}</Text>;
  if (payload.error || payload.data === null) return <Text>{t('ui.error')}</Text>;
  const data = payload.data;
  return (
    <Stack space="space.300">
      <DelegationMapView
        view={mapView(data.map, t)}
        t={t}
        onOpenCohort={(cell) => setSelected({ nature: cell.nature, zone: cell.zone, size: cell.cohort.size })}
      />
      {selected === null ? null : (
        <CohortScreen
          t={t}
          nature={selected.nature}
          zone={selected.zone}
          size={selected.size}
          onBack={() => setSelected(null)}
        />
      )}
      <CoverageView view={coverageView(data.coverage, t)} t={t} />
      <CalibrationView
        view={calibrationView(data.calibrationRows, data.adviceAddsNothing, t)}
        t={t}
      />
    </Stack>
  );
}
