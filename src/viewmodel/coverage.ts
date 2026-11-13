/**
 * The coverage screen as a projection (SPEC §16.6, §19 "Droits"; DP-19,
 * recipe 15).
 *
 * A missing right is said out loud: the screen names each right on the graph and
 * its state, so an emptied result is never read as a zero (recipe 15). The rate
 * of known involvement keeps its sample size and its interval (recipe 10).
 *
 * Pure module: no `@forge/*`, no clock. The figures come from lot L6 through
 * the `Coverage` contract; this module formats them and computes nothing.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Coverage } from '../types-advice.js';
import type { GraphObjectType, GraphPermissionState } from '../types.js';
import { proportion } from '../domain/stats.js';
import type { Translate } from '../i18n/index.js';
import type { DemoNotice, RateLine } from './common.js';
import { demoNotice, rateLine } from './common.js';

/** One right on the graph, named with its state (SPEC §19, recipe 15). */
export interface CoveragePermissionView {
  readonly objectType: GraphObjectType;
  readonly label: string;
  readonly state: GraphPermissionState;
  readonly stateLabel: string;
  readonly testedLine: string;
}

/** The coverage screen (SPEC §16.6). */
export interface CoverageView {
  readonly title: string;
  /** Known involvement, with its sample size and its interval (recipe 10). */
  readonly knownLine: string;
  readonly known: RateLine | null;
  readonly permissions: readonly CoveragePermissionView[];
  /** True when at least one right is missing: the figures are partial, not zero. */
  readonly partial: boolean;
  readonly partialNotice: string | null;
  readonly lastCollectionLine: string;
  readonly demo: DemoNotice | null;
  readonly anonymityNotice: string;
}

/** One right projected: its state is always said, never hidden (recipe 15). */
function permissionView(
  objectType: GraphObjectType,
  state: GraphPermissionState,
  testedAt: string,
  t: Translate,
): CoveragePermissionView {
  return {
    objectType,
    label: t(`coverage.permission.${objectType}`),
    state,
    stateLabel: t(`coverage.permission.${state}`),
    testedLine: testedAt === '' ? t('coverage.permission.unknown') : t('coverage.last-collection', { at: testedAt }),
  };
}

/** The last collection line: absent, failed or dated, all three said (DP-19). */
function lastCollectionLine(coverage: Coverage, t: Translate): string {
  if (coverage.lastCollectionAt === '') return t('coverage.last-collection.none');
  if (!coverage.lastCollectionOk) return t('coverage.last-collection.failed');
  return t('coverage.last-collection', { at: coverage.lastCollectionAt });
}

/** The empty coverage screen: no collection yet is normal data (SPEC §20). */
function emptyView(t: Translate): CoverageView {
  return {
    title: t('coverage.title'),
    knownLine: t('coverage.no-known-involvement'),
    known: null,
    permissions: [],
    partial: false,
    partialNotice: null,
    lastCollectionLine: t('coverage.last-collection.none'),
    demo: null,
    anonymityNotice: t('ui.anonymity'),
  };
}

/**
 * Projects the coverage. `null` gives an explicit empty screen; a missing right
 * empties the figures and says so instead of showing a silent zero (recipe 15).
 */
export function coverageView(coverage: Coverage | null, t: Translate): CoverageView {
  if (coverage === null) return emptyView(t);
  const known = coverage.totalIssues === 0
    ? null
    : rateLine(proportion(coverage.knownIssues, coverage.totalIssues), t);
  const missing = coverage.permissions.filter((item) => item.state !== 'granted').length;
  return {
    title: t('coverage.title'),
    knownLine: known === null
      ? t('coverage.no-known-involvement')
      : t('coverage.known-involvement', { rate: known.text }),
    known,
    permissions: coverage.permissions.map((item) => permissionView(item.objectType, item.state, item.testedAt, t)),
    partial: missing > 0,
    partialNotice: missing === 0 ? null : t('coverage.partial'),
    lastCollectionLine: lastCollectionLine(coverage, t),
    demo: demoNotice(coverage.demo, t),
    anonymityNotice: t('ui.anonymity'),
  };
}
