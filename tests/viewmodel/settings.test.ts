/**
 * The project settings screen as a projection (SPEC §16.5, §13, §5; DP-02, DP-22).
 */
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../../src/i18n/index.js';
import { settingsView } from '../../src/viewmodel/settings.js';
import { epoch, pattern, settings } from './fixtures.js';

const fr = createTranslator('fr');

describe('settingsView (SPEC §16.5)', () => {
  it('shows the adoption date, the threshold and the declared lists', () => {
    const view = settingsView(settings(), [pattern()], [epoch()], fr);
    expect(view.adoptionLine).toContain('2026-01-15');
    expect(view.thresholdLine).toContain('20');
    expect(view.natures).toEqual(['bugfix', 'refactor']);
    expect(view.sensitiveZones).toEqual(['api']);
  });

  it('says when no adoption date was declared (SPEC §13)', () => {
    const view = settingsView(settings({ adoptionDate: '' }), [], [], fr);
    expect(view.adoptionLine).toBe(fr('docs.no-adoption-date'));
  });

  it('renders the hardened-review definition as the project wrote it (SPEC §8)', () => {
    const view = settingsView(settings(), [], [], fr);
    expect(view.hardenedReviewLines[0]).toContain('two reviewers and zone owner');
    expect(view.hardenedReviewLines.join(' ')).toContain('2');
  });

  it('shows the commit-mention catalogue with how often each was seen (DP-02)', () => {
    const view = settingsView(settings(), [pattern({ seenCount: 3 }), pattern({ id: 'p2', agentName: 'Off', enabled: false, seenCount: 0 })], [], fr);
    expect(view.patterns).toHaveLength(2);
    expect(view.patterns[0].line).toContain('3');
    expect(view.patternsToConfirm).toEqual([fr('docs.commit-mention', { agent: 'Agent', count: 3 })]);
  });

  it('lists the epochs (DP-22)', () => {
    const view = settingsView(settings(), [], [epoch({ label: 'new model' })], fr);
    expect(view.epochs.map((e) => e.label)).toEqual(['new model']);
  });

  it('projects null settings as an explicit empty screen', () => {
    const view = settingsView(null, [], [], fr);
    expect(view.natures).toEqual([]);
    expect(view.adoptionLine).toBe(fr('docs.no-adoption-date'));
    expect(view.patternsTitle).toBe(fr('docs.no-commit-mention'));
  });

  it('marks a demo project (DP-20)', () => {
    expect(settingsView(settings({ demo: true }), [], [], fr).demo).not.toBeNull();
  });
});
