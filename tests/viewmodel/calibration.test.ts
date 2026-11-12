/**
 * The calibration screen as a projection (SPEC §10, §16.7; DP-21, recipe 10).
 */
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../../src/i18n/index.js';
import { calibrationView } from '../../src/viewmodel/calibration.js';
import { calibrationRow } from './fixtures.js';
import { RECOMMENDATIONS } from '../../src/types-advice.js';

const fr = createTranslator('fr');

describe('calibrationView (SPEC §16.7, DP-21)', () => {
  it('renders one row per recommendation, in SPEC order', () => {
    const view = calibrationView([calibrationRow('delegate', 41, 0.83, 0.69, 0.91)], false, fr);
    expect(view.rows.map((row) => row.recommendation)).toEqual([...RECOMMENDATIONS]);
  });

  it('shows the observed clean closure with its sample size and interval (recipe 10)', () => {
    const view = calibrationView([calibrationRow('delegate', 41, 0.83, 0.69, 0.91)], false, fr);
    const row = view.rows.find((r) => r.recommendation === 'delegate')!;
    expect(row.clean!.n).toBe(41);
    expect(row.line).toContain('n = 41');
    expect(row.line).toContain('[69 % ; 91 %]');
  });

  it('gives "we do not know" the same dignity as the other rows (SPEC §7 rule 4)', () => {
    const view = calibrationView([calibrationRow('not-enough-data', 5, 0.5, 0.2, 0.8)], false, fr);
    const row = view.rows.find((r) => r.recommendation === 'not-enough-data')!;
    expect(row.clean).not.toBeNull();
    expect(row.label).toBe(fr('recommendation.not-enough-data'));
  });

  it('says when a recommendation got no ticket, never a zero', () => {
    const view = calibrationView([calibrationRow('delegate', 41, 0.83, 0.69, 0.91)], false, fr);
    const keep = view.rows.find((r) => r.recommendation === 'keep-human')!;
    expect(keep.clean).toBeNull();
    expect(keep.line).toBe(fr('ui.calibration.no-row'));
  });

  it('warns up front when the advice adds nothing (DP-21)', () => {
    expect(calibrationView([calibrationRow('delegate', 41, 0.5, 0.4, 0.6)], true, fr).warning)
      .toBe(fr('docs.calibration-warning'));
    expect(calibrationView([calibrationRow('delegate', 41, 0.9, 0.8, 0.95)], false, fr).warning)
      .toBeNull();
  });

  it('says when nothing has been calibrated yet', () => {
    const view = calibrationView([], true, fr);
    expect(view.intro).toBe(fr('docs.calibration-empty'));
  });
});
