/**
 * The sprint split as a projection (SPEC §16.4, §12; DP-24, recipe 13).
 */
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../../src/i18n/index.js';
import { sprintShareView, sprintView } from '../../src/viewmodel/sprint.js';
import { workItem } from './fixtures.js';

const fr = createTranslator('fr');

describe('sprintView (SPEC §16.4, recipe 13)', () => {
  it('lists the tickets an agent may take, safest first, with their confidence', () => {
    const view = sprintView([workItem({ issueKey: 'PROJ-1' }), workItem({ issueKey: 'PROJ-2', confidence: 'medium' })], fr);
    expect(view.items.map((item) => item.issueKey)).toEqual(['PROJ-1', 'PROJ-2']);
    expect(view.items[1].confidenceLine).toBe(fr('confidence.medium'));
    expect(view.countLine).toContain('2');
  });

  it('says when no ticket can be entrusted yet, instead of an empty list', () => {
    const view = sprintView([], fr);
    expect(view.items).toEqual([]);
    expect(view.countLine).toBe(fr('stats.sprint-empty'));
  });

  it('carries the anonymity reminder (DP-17)', () => {
    expect(sprintView([workItem()], fr).anonymityNotice).toBe(fr('ui.anonymity'));
  });
});

describe('sprintShareView (DP-24)', () => {
  it('renders the DP-24 sentence with the share and the sprint', () => {
    const view = sprintShareView(0.38, '42', fr);
    expect(view.hasSprint).toBe(true);
    expect(view.shareLine).toContain('38 %');
    expect(view.shareLine).toContain('42');
  });

  it('says when no sprint was given, never a zero share', () => {
    const view = sprintShareView(0, '', fr);
    expect(view.hasSprint).toBe(false);
    expect(view.shareLine).toBe(fr('stats.no-sprint'));
  });
});
