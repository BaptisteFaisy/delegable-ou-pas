/**
 * The delegation map as a screen shows it (SPEC §12 "La matrice", SPEC §16.2;
 * DP-14, DP-17, DP-22, DP-24, recipes 10 and 11).
 *
 * The matrix is natures × zones: green "delegate", orange "agent, hardened
 * review", red "keep with a human", grey "not enough history". A cell opens its
 * cohort; a masked cell shows the mask sentence instead of its figures (DP-17).
 *
 * A total is never projected alone: the grey share and the delegable share of
 * the sprint come with the matrix that decomposes them (SPEC §7 rule 7).
 * Deviations carry counts and cohorts, never a person (SPEC §12, DP-17).
 *
 * Pure module: no `@forge/*`, no clock.
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { DelegationMap, DelegationMapCell } from '../types-advice.js';
import type { CohortKey, Nature, Zone } from '../types.js';
import type { MapColor, Recommendation } from '../types-advice.js';
import { percent } from '../domain/stats.js';
import type { Translate } from '../i18n/index.js';
import type { DemoNotice } from './common.js';
import { cohortLine, demoNotice, maskedNotice, recommendationLabel } from './common.js';

/** One cell of the matrix, ready to render (SPEC §12, DP-14). */
export interface MapCellView {
  readonly nature: Nature;
  readonly zone: Zone;
  readonly color: MapColor;
  readonly recommendation: Recommendation;
  /** The label of the recommendation, or the mask sentence when masked (DP-17). */
  readonly label: string;
  readonly cohort: CohortKey;
  readonly cohortLine: string;
  readonly masked: boolean;
  /** Sample sizes of both arms, or the mask sentence when masked (recipe 10). */
  readonly sampleLine: string;
  readonly agentN: number;
  readonly humanN: number;
  /** What would turn this cell from red to orange (SPEC §12, DP-26). */
  readonly failureCauses: readonly string[];
}

/** One row of the matrix: a nature and its cells, one per zone. */
export interface MapRowView {
  readonly nature: Nature;
  readonly cells: readonly MapCellView[];
}

/** The whole map screen (SPEC §16.2). */
export interface MapView {
  readonly title: string;
  readonly legend: string;
  readonly zones: readonly Zone[];
  readonly rows: readonly MapRowView[];
  /** "Since epoch 3": one epoch at a time, said out loud (DP-22). */
  readonly epochLine: string;
  /** The share of grey cells, with the matrix that decomposes it (SPEC §7 rule 7). */
  readonly greyShareLine: string;
  /** "38 % of the points of sprint 42 are to be entrusted" (DP-24). */
  readonly delegableShareLine: string;
  /** Deviations from the advice: counts and cohorts, no person (DP-17). */
  readonly deviations: readonly string[];
  readonly failureCausesTitle: string;
  readonly demo: DemoNotice | null;
}

/** One cell projected; a masked cell keeps no figure (DP-17, recipe 11). */
function cellView(cell: DelegationMapCell, t: Translate): MapCellView {
  const masked = cell.masked;
  return {
    nature: cell.nature,
    zone: cell.zone,
    color: cell.color,
    recommendation: cell.recommendation,
    label: masked ? maskedNotice(t) : recommendationLabel(cell.recommendation, t),
    cohort: cell.cohort,
    cohortLine: cohortLine(cell.cohort, t),
    masked,
    sampleLine: masked
      ? maskedNotice(t)
      : t('ui.matrix.sample', { agentN: cell.agentN, humanN: cell.humanN }),
    agentN: masked ? 0 : cell.agentN,
    humanN: masked ? 0 : cell.humanN,
    failureCauses: masked ? [] : [...cell.failureCauses],
  };
}

/** An empty cell: a nature × zone with no cohort yet is normal data. */
function emptyCell(nature: Nature, zone: Zone, t: Translate): MapCellView {
  return {
    nature,
    zone,
    color: 'grey',
    recommendation: 'not-enough-data',
    label: t('ui.matrix.no-cell'),
    cohort: { level: 'nature-zone-size', nature, zone, size: null },
    cohortLine: t('ui.matrix.cell', { nature, zone }),
    masked: false,
    sampleLine: t('ui.matrix.no-cell'),
    agentN: 0,
    humanN: 0,
    failureCauses: [],
  };
}

/** The matrix, row by row: natures in rows, zones in columns (SPEC §12). */
function rowsOf(map: DelegationMap, t: Translate): readonly MapRowView[] {
  return map.natures.map((nature) => ({
    nature,
    cells: map.zones.map((zone) => {
      const cell = map.cells.find((item) => item.nature === nature && item.zone === zone);
      return cell === undefined ? emptyCell(nature, zone, t) : cellView(cell, t);
    }),
  }));
}

/** The epochs as one line, the current one first (SPEC §12, DP-22). */
function epochLineOf(map: DelegationMap, t: Translate): string {
  if (map.epochs.length === 0) return t('ui.empty');
  const labels = map.epochs.map((epoch) => epoch.label).join(', ');
  return t('ui.epoch.since', { label: labels });
}

/** The delegable share of the sprint, or the explicit "no sprint" (DP-24). */
function delegableShareLineOf(map: DelegationMap, t: Translate): string {
  if (map.sprintId === '') return t('stats.no-sprint');
  return t('stats.delegable-share', {
    share: percent(map.delegableShare),
    sprint: map.sprintId,
  });
}

/** One deviation as a sentence: a count and a cohort, never a person (DP-17). */
function deviationLines(map: DelegationMap, t: Translate): readonly string[] {
  if (map.deviations.length === 0) return [t('ui.deviations.none')];
  return map.deviations.map((deviation) => t(`ui.deviation.${deviation.direction}`, {
    count: deviation.count,
  }));
}

/** The empty map: an absent map is normal data and renders empty (SPEC §20). */
const EMPTY_MAP: DelegationMap = {
  projectId: '',
  epochId: '',
  epochs: [],
  natures: [],
  zones: [],
  cells: [],
  greyShare: 0,
  delegableShare: 0,
  sprintId: '',
  deviations: [],
  demo: false,
  computedAt: '',
};

/**
 * Projects the delegation map. `null` gives an explicit empty matrix, never an
 * exception (SPEC §20 "données absentes = normales").
 */
export function mapView(map: DelegationMap | null, t: Translate): MapView {
  const value = map ?? EMPTY_MAP;
  return {
    title: t('ui.matrix.title'),
    legend: t('ui.matrix.legend'),
    zones: [...value.zones],
    rows: rowsOf(value, t),
    epochLine: epochLineOf(value, t),
    greyShareLine: t('stats.grey-share', { share: percent(value.greyShare) }),
    delegableShareLine: delegableShareLineOf(value, t),
    deviations: deviationLines(value, t),
    failureCausesTitle: t('ui.failure-causes.title'),
    demo: demoNotice(value.demo, t),
  };
}
