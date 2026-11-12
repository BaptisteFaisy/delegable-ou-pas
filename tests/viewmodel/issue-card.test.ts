/**
 * The ticket card as a projection (SPEC §8, §16.1; DP-11, DP-13, DP-20, DP-26,
 * recipes 9 and 10).
 */
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../../src/i18n/index.js';
import { cardView, issuePanelView } from '../../src/viewmodel/issue-card.js';
import { card, decision, involvement } from './fixtures.js';

const fr = createTranslator('fr');

describe('cardView (SPEC §16.1)', () => {
  it('projects the key, the recommendation and the cohort of the card', () => {
    const view = cardView(card(), fr);
    expect(view.title).toContain('PROJ-412');
    expect(view.recommendation).toBe('delegate');
    expect(view.cohortLine).toContain('bugfix');
    expect(view.cell).toBe('green');
  });

  it('keeps both arms with their sample size and interval (recipe 10)', () => {
    const view = cardView(card(), fr);
    expect(view.agent).not.toBeNull();
    expect(view.agent!.n).toBe(41);
    expect(view.human).not.toBeNull();
    expect(view.human!.n).toBe(26);
    // The interval travels with the rate: the screen cannot show one alone.
    expect(view.agent!.ciLow).toBe(0.69);
    expect(view.agent!.ciHigh).toBe(0.91);
  });

  it('carries the median line, the references, the conditions and the guardrails', () => {
    const view = cardView(card({ conditions: ['two reviewers'], guardrails: ['sensitive-zone'] }), fr);
    expect(view.medianLine).toContain('h');
    expect(view.referenceKeys).toEqual(['PROJ-100', 'PROJ-101']);
    expect(view.conditions).toEqual(['two reviewers']);
    expect(view.guardrails).toEqual(['sensitive-zone']);
  });

  it('projects a null card as an explicit empty view, never an exception', () => {
    const view = cardView(null, fr);
    expect(view.title).toBe(fr('card.empty'));
    expect(view.agent).toBeNull();
    expect(view.human).toBeNull();
    expect(view.cell).toBe('grey');
    expect(view.referenceKeys).toEqual([]);
  });

  it('marks a demo card (DP-20)', () => {
    expect(cardView(card({ demo: true }), fr).demo).toBe(true);
    expect(cardView(card({ demo: false }), fr).demo).toBe(false);
  });
});

describe('issuePanelView (SPEC §16.1, DP-01, DP-13, DP-26, recipe 9)', () => {
  it('adds the decision taken and whether it followed the advice', () => {
    const view = issuePanelView(card(), decision({ followed: true }), null, fr);
    expect(view.decision.taken).toBe('delegate');
    expect(view.decision.followed).toBe(true);
    expect(view.decision.line).toContain(fr('action.delegate'));
  });

  it('says when the advice was not followed', () => {
    const view = issuePanelView(card(), decision({ followed: false, taken: 'keep-human' }), null, fr);
    expect(view.decision.line).toBe(
      fr('card.decision-not-followed', { decision: fr('action.keep-human') }),
    );
  });

  it('adds the involvement detected and its source (DP-01)', () => {
    const view = issuePanelView(card(), null, involvement(), fr);
    expect(view.involvement).not.toBeNull();
    expect(view.involvement!.level).toBe('driven');
    expect(view.involvement!.sourceLine).toContain(fr('action.source.mcp-declaration'));
  });

  it('shows the guardrails that fired, said out loud (recipe 9)', () => {
    const view = issuePanelView(card({ guardrails: ['open-incident'] }), null, null, fr);
    expect(view.guardrailLines).toEqual([fr('guardrail.open-incident')]);
  });

  it('carries what went wrong with an agent (DP-26)', () => {
    const view = issuePanelView(card({ failureCauses: ['tests not run'] }), null, null, fr);
    expect(view.failureCauses).toEqual(['tests not run']);
    expect(view.failureCausesTitle).toBe(fr('card.failure-causes'));
  });

  it('announces a widened cohort and stays silent on the narrowest one (SPEC §7 rule 1)', () => {
    const wide = issuePanelView(card({ cohort: { level: 'nature-size', nature: 'bugfix', zone: null, size: 'M' } }), null, null, fr);
    expect(wide.widenedNotice).not.toBeNull();
    const narrow = issuePanelView(card(), null, null, fr);
    expect(narrow.widenedNotice).toBeNull();
  });

  it('carries the demo banner and the anonymity reminder', () => {
    const view = issuePanelView(card({ demo: true }), null, null, fr);
    expect(view.demo).not.toBeNull();
    expect(view.anonymityNotice).toBe(fr('ui.anonymity'));
  });

  it('projects everything absent as an explicit empty panel', () => {
    const view = issuePanelView(null, null, null, fr);
    expect(view.card.title).toBe(fr('card.empty'));
    expect(view.decision.taken).toBeNull();
    expect(view.involvement).toBeNull();
    expect(view.reasons).toEqual([]);
    expect(view.failureCauses).toEqual([]);
  });
});
