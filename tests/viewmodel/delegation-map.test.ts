/**
 * The delegation map as a projection (SPEC §12, §16.2; DP-14, DP-17, DP-22,
 * DP-24, recipes 10 and 11).
 */
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../../src/i18n/index.js';
import { mapView } from '../../src/viewmodel/delegation-map.js';
import { delegationMap } from './fixtures.js';

const fr = createTranslator('fr');

describe('mapView (SPEC §16.2, DP-14)', () => {
  it('builds one row per nature and one cell per zone', () => {
    const view = mapView(delegationMap(), fr);
    expect(view.rows.map((row) => row.nature)).toEqual(['bugfix', 'refactor']);
    expect(view.zones).toEqual(['billing', 'api']);
    for (const row of view.rows) expect(row.cells).toHaveLength(2);
  });

  it('paints each cell with its colour and its sample sizes (recipe 10)', () => {
    const view = mapView(delegationMap(), fr);
    const green = view.rows[0].cells[0];
    expect(green.color).toBe('green');
    expect(green.agentN).toBe(41);
    expect(green.humanN).toBe(26);
    expect(green.sampleLine).toContain('41');
  });

  it('renders an empty cell for a nature × zone with no cohort', () => {
    const view = mapView(delegationMap(), fr);
    const empty = view.rows[0].cells[1]; // bugfix × api: no cell in the map
    expect(empty.color).toBe('grey');
    expect(empty.label).toBe(fr('ui.matrix.no-cell'));
  });

  it('hides every figure of a masked cohort (DP-17, recipe 11)', () => {
    const view = mapView(delegationMap(), fr);
    const masked = view.rows[1].cells[1]; // refactor × api, masked
    expect(masked.masked).toBe(true);
    expect(masked.label).toBe(fr('cohort.masked'));
    expect(masked.sampleLine).toBe(fr('cohort.masked'));
    expect(masked.agentN).toBe(0);
    expect(masked.humanN).toBe(0);
    expect(masked.failureCauses).toEqual([]);
  });

  it('shows the delegable share of the sprint as the DP-24 sentence', () => {
    const view = mapView(delegationMap(), fr);
    expect(view.delegableShareLine).toContain('38 %');
    expect(view.delegableShareLine).toContain('42');
  });

  it('says "no sprint" instead of showing a zero when none was given', () => {
    const view = mapView(delegationMap({ sprintId: '' }), fr);
    expect(view.delegableShareLine).toBe(fr('stats.no-sprint'));
  });

  it('shows the grey share next to the matrix that decomposes it (SPEC §7 rule 7)', () => {
    const view = mapView(delegationMap(), fr);
    expect(view.greyShareLine).toContain('25 %');
    expect(view.rows.length).toBeGreaterThan(0);
  });

  it('lists deviations with counts and cohorts, never a person (DP-17)', () => {
    const view = mapView(delegationMap(), fr);
    expect(view.deviations).toHaveLength(1);
    expect(view.deviations[0]).toContain('3');
    expect(view.deviations[0].toLowerCase()).not.toContain('john');
  });

  it('says when there is no deviation', () => {
    const view = mapView(delegationMap({ deviations: [] }), fr);
    expect(view.deviations).toEqual([fr('ui.deviations.none')]);
  });

  it('marks a demo map (DP-20)', () => {
    expect(mapView(delegationMap({ demo: true }), fr).demo).not.toBeNull();
  });
});
