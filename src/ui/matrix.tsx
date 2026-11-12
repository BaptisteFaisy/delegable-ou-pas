/**
 * The delegation matrix, natures × zones (SPEC §12 "La matrice", §16.2;
 * DP-14, DP-17, recipe 11).
 *
 * Mute component: it displays the `MapView` rows the viewmodel projected. Each
 * cell shows its colour, its two sample sizes (recipe 10: a cell is never shown
 * without them) and opens its cohort; a masked cell shows the mask sentence
 * instead of any figure (DP-17).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Box, Button, Inline, Stack, Text } from '@forge/react';
import type { Translate } from '../i18n/index.js';
import type { MapCellView, MapRowView, MapView } from '../viewmodel/delegation-map.js';
import { ColorBadge } from './components/badges.js';
import { BulletList, SectionTitle } from './components/sections.js';

/** Props of one cell of the matrix. */
export interface MatrixCellProps {
  readonly cell: MapCellView;
  readonly t: Translate;
  readonly onOpenCohort: (cell: MapCellView) => void;
}

/** One cell: colour, sample sizes, failure causes, and the way to its cohort. */
export function MatrixCell(props: MatrixCellProps) {
  const cell = props.cell;
  return (
    <Box padding="space.100">
      <Stack space="space.050">
        <Text>{cell.cohortLine}</Text>
        <ColorBadge color={cell.color} label={cell.label} />
        <Text>{cell.sampleLine}</Text>
        <BulletList items={cell.failureCauses} />
        <Button onClick={() => props.onOpenCohort(cell)}>{props.t('ui.matrix.open-cohort')}</Button>
      </Stack>
    </Box>
  );
}

/** One row of the matrix: a nature and its cells, one per zone (SPEC §12). */
export function MatrixRow(props: {
  readonly row: MapRowView;
  readonly t: Translate;
  readonly onOpenCohort: (cell: MapCellView) => void;
}) {
  return (
    <Stack space="space.050">
      <Text>{props.row.nature}</Text>
      <Inline space="space.100">
        {props.row.cells.map((cell) => (
          <MatrixCell
            key={`${cell.nature}:${cell.zone}`}
            cell={cell}
            t={props.t}
            onOpenCohort={props.onOpenCohort}
          />
        ))}
      </Inline>
    </Stack>
  );
}

/** Props of the matrix (frozen contract, docs/CONTRACTS.md §L8). */
export interface DelegationMapViewProps {
  readonly view: MapView;
  readonly t: Translate;
  readonly onOpenCohort: (cell: MapCellView) => void;
}

/** The matrix with its legend: the four colours, grey included (SPEC §12). */
export function DelegationMatrix(props: DelegationMapViewProps) {
  const view = props.view;
  return (
    <Stack space="space.200">
      <SectionTitle title={view.title} />
      <Text>{view.legend}</Text>
      {view.rows.map((row) => (
        <MatrixRow key={row.nature} row={row} t={props.t} onOpenCohort={props.onOpenCohort} />
      ))}
    </Stack>
  );
}
