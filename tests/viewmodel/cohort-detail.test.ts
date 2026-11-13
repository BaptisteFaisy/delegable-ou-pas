/**
 * The cohort detail as a projection (SPEC §16.3, §7 rule 1, §21; DP-07, DP-17,
 * DP-22, recipes 10, 11 and 14).
 */
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../../src/i18n/index.js';
import { cohortView } from '../../src/viewmodel/cohort-detail.js';
import { AGENT_CLEAN, HUMAN_CLEAN, cohortOutput, epochArm } from './fixtures.js';

const fr = createTranslator('fr');

describe('cohortView (SPEC §16.3)', () => {
  it('projects both arms with their sample size and interval (recipe 10)', () => {
    const view = cohortView(cohortOutput(), fr);
    const arms = view.epochs[0].arms;
    expect(arms).toHaveLength(2);
    expect(arms[0].clean!.n).toBe(41);
    expect(arms[0].clean!.interval).toBe('[69 % ; 91 %]');
    expect(arms[1].clean!.n).toBe(26);
  });

  it('announces a widening when the cohort is broader than nature × zone × size', () => {
    const view = cohortView(cohortOutput({ cohort: { level: 'nature-size', nature: 'bugfix', zone: null, size: 'M' } }), fr);
    expect(view.widenedNotice).not.toBeNull();
  });

  it('masks a cohort carried by fewer than three people and shows no figure (recipe 11)', () => {
    const view = cohortView(cohortOutput({ masked: true, peopleCount: 2 }), fr);
    expect(view.masked).toBe(true);
    expect(view.maskedNotice).toBe(fr('cohort.masked'));
    expect(view.cohortLine).toBe(fr('cohort.masked'));
    expect(view.epochs).toEqual([]);
    // The number of people is never displayed for its own sake (DP-17).
    expect(view.peopleLine).toBe(fr('cohort.no-people'));
  });

  it('reports the people count only when the cohort is not masked', () => {
    const view = cohortView(cohortOutput({ masked: false, peopleCount: 8 }), fr);
    expect(view.peopleLine).toContain('8');
  });

  it('keeps an empty arm empty instead of zeroing it (SPEC §20)', () => {
    const out = cohortOutput({
      epochs: [{
        epochId: 'e3', epochLabel: 'new model', outdated: false, conclusion: 'not-enough-data',
        balance: { balanced: true, signals: [] },
        arms: [epochArm('agent', AGENT_CLEAN), epochArm('human', { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })],
      }],
    });
    const view = cohortView(out, fr);
    const human = view.epochs[0].arms.find((arm) => arm.arm === 'human')!;
    expect(human.clean).toBeNull();
  });

  it('says when the human arm is empty (SPEC §21)', () => {
    const out = cohortOutput({
      epochs: [{
        epochId: 'e3', epochLabel: 'new model', outdated: false, conclusion: 'not-enough-data',
        balance: { balanced: true, signals: [] },
        arms: [epochArm('agent', AGENT_CLEAN), epochArm('human', { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })],
      }],
    });
    expect(cohortView(out, fr).noHumanArmNotice).toBe(fr('cohort.no-human-arm'));
  });

  it('words the composition comparison (DP-10)', () => {
    const balanced = cohortView(cohortOutput(), fr);
    expect(balanced.epochs[0].balanceLines).toEqual([fr('balance.balanced')]);
    const out = cohortOutput({
      epochs: [{
        epochId: 'e3', epochLabel: 'new model', outdated: false, conclusion: 'not-enough-data',
        balance: { balanced: false, signals: [{ criterion: 'size-mix', agentShare: 0.6, humanShare: 0.3, difference: 0.3 }] },
        arms: [epochArm('agent', AGENT_CLEAN), epochArm('human', HUMAN_CLEAN)],
      }],
    });
    const unbalanced = cohortView(out, fr);
    expect(unbalanced.epochs[0].balanceLines[0]).toBe(fr('balance.unbalanced'));
    expect(unbalanced.epochs[0].balanceLines.length).toBeGreaterThan(1);
  });

  it('projects a null cohort as an explicit empty screen', () => {
    const view = cohortView(null, fr);
    expect(view.cohortLine).toBe(fr('ui.cohort.empty'));
    expect(view.epochs).toEqual([]);
  });

  it('marks a demo cohort (DP-20)', () => {
    expect(cohortView(cohortOutput({ demo: true }), fr).demo).not.toBeNull();
  });
});
