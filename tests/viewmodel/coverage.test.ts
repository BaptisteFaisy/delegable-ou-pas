/**
 * The coverage screen as a projection (SPEC §16.6, §19; DP-19, recipe 15).
 *
 * A missing right is said out loud, never hidden behind a silent zero.
 */
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../../src/i18n/index.js';
import { coverageView } from '../../src/viewmodel/coverage.js';
import { coverage } from './fixtures.js';

const fr = createTranslator('fr');

describe('coverageView (SPEC §16.6, recipe 15)', () => {
  it('shows the known involvement with its sample size and interval (recipe 10)', () => {
    const view = coverageView(coverage(), fr);
    expect(view.known).not.toBeNull();
    expect(view.known!.n).toBe(100);
    expect(view.knownLine).toContain('n = 100');
  });

  it('names each right on the graph with its state', () => {
    const view = coverageView(coverage(), fr);
    expect(view.permissions).toHaveLength(4);
    expect(view.permissions.map((p) => p.objectType)).toEqual(['commit', 'pull-request', 'issue', 'user']);
    expect(view.permissions.every((p) => p.stateLabel.length > 0)).toBe(true);
  });

  it('says a missing right out loud instead of a silent zero (recipe 15)', () => {
    const view = coverageView(coverage({
      permissions: [
        { objectType: 'commit', state: 'missing', testedAt: '' },
        { objectType: 'pull-request', state: 'granted', testedAt: '2026-09-01T00:00:00Z' },
        { objectType: 'issue', state: 'unknown', testedAt: '' },
        { objectType: 'user', state: 'granted', testedAt: '2026-09-01T00:00:00Z' },
      ],
    }), fr);
    expect(view.partial).toBe(true);
    expect(view.partialNotice).toBe(fr('coverage.partial'));
    const missing = view.permissions.find((p) => p.objectType === 'commit')!;
    expect(missing.state).toBe('missing');
    expect(missing.stateLabel).toBe(fr('coverage.permission.missing'));
  });

  it('is not partial when every right is granted', () => {
    const view = coverageView(coverage(), fr);
    expect(view.partial).toBe(false);
    expect(view.partialNotice).toBeNull();
  });

  it('says when the last collection failed or never ran (DP-19)', () => {
    expect(coverageView(coverage({ lastCollectionOk: false }), fr).lastCollectionLine)
      .toBe(fr('coverage.last-collection.failed'));
    expect(coverageView(coverage({ lastCollectionAt: '' }), fr).lastCollectionLine)
      .toBe(fr('coverage.last-collection.none'));
  });

  it('projects a null coverage as an explicit empty screen', () => {
    const view = coverageView(null, fr);
    expect(view.known).toBeNull();
    expect(view.knownLine).toBe(fr('coverage.no-known-involvement'));
    expect(view.permissions).toEqual([]);
  });

  it('renders no rate when there is no ticket yet (never a zero)', () => {
    const view = coverageView(coverage({ knownIssues: 0, totalIssues: 0 }), fr);
    expect(view.known).toBeNull();
    expect(view.knownLine).toBe(fr('coverage.no-known-involvement'));
  });

  it('marks demo data (DP-20)', () => {
    expect(coverageView(coverage({ demo: true }), fr).demo).not.toBeNull();
  });
});
