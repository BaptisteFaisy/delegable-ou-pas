/**
 * The single rate renderer (SPEC §7 rule 3, §20; DP-08, recipe 10).
 *
 * Recipe 10: no screen shows a rate without its sample size and its interval.
 * `rateLine` is the ONE place a rate is formatted; these tests check the three
 * elements are always together, and that a rate can never be rendered bare.
 */
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../../src/i18n/index.js';
import { demoNotice, maskedNotice, rateLine, rateText, widenedNotice } from '../../src/viewmodel/common.js';
import { percent } from '../../src/domain/stats.js';
import { AGENT_CLEAN, COHORT_NARROW, COHORT_WIDE } from './fixtures.js';

const fr = createTranslator('fr');
const en = createTranslator('en');

describe('rateLine — recipe 10, the three elements together', () => {
  it('carries the rate, the sample size and the interval as separate parts', () => {
    const line = rateLine(AGENT_CLEAN, fr);
    expect(line).not.toBeNull();
    expect(line!.rate).toBe('83 %');
    expect(line!.n).toBe(41);
    expect(line!.sample).toBe('n = 41');
    expect(line!.interval).toBe('[69 % ; 91 %]');
  });

  it('renders one text that holds all three elements', () => {
    const line = rateLine(AGENT_CLEAN, fr)!;
    expect(line.text).toContain('83 %');
    expect(line.text).toContain('n = 41');
    expect(line.text).toContain('[69 % ; 91 %]');
  });

  it('never produces a rate text without its sample size and interval', () => {
    // The whole point of recipe 10: a bare "83 %" must be impossible to render.
    const line = rateLine(AGENT_CLEAN, en)!;
    expect(line.text).toMatch(/83 %/);
    expect(line.text).toMatch(/n = 41/);
    expect(line.text).toMatch(/\[\d+ % ; \d+ %\]/);
  });

  it('keeps null when the arm has no ticket (never a zero)', () => {
    expect(rateLine(null, fr)).toBeNull();
    expect(rateText(null, fr)).toBe(fr('stats.none'));
  });

  it('formats a bare fraction with the domain percent', () => {
    expect(percent(0.38)).toBe('38 %');
    expect(percent(0)).toBe('0 %');
  });
});

describe('demo banner — DP-20', () => {
  it('is present on a demo project and absent on real data', () => {
    expect(demoNotice(true, fr)).not.toBeNull();
    expect(demoNotice(true, fr)!.title).toBe(fr('ui.demo-banner.title'));
    expect(demoNotice(false, fr)).toBeNull();
  });
});

describe('masked cohort and widening — DP-17, SPEC §7 rule 1', () => {
  it('says the mask out loud', () => {
    expect(maskedNotice(fr)).toBe(fr('cohort.masked'));
  });

  it('announces a widening but not the narrowest cohort', () => {
    expect(widenedNotice(COHORT_NARROW, fr)).toBeNull();
    expect(widenedNotice(COHORT_WIDE, fr)).toContain('nature × taille');
  });
});
