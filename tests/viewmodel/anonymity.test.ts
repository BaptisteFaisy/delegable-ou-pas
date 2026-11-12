/**
 * Anonymity and purity of the viewmodels (SPEC §7 rule 8, §18 last line, §20;
 * DP-17, recipe 12).
 *
 * No screen, no statistic carries a person identifier: the test sweeps every
 * projected view with the domain guard `isPersonSafe` (reused, never rewritten)
 * and checks the viewmodel sources stay pure — no `@forge/*`, no clock.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPersonSafe, personIdentifierLeak } from '../../src/domain/privacy.js';
import { createTranslator } from '../../src/i18n/index.js';
import { cardView, issuePanelView } from '../../src/viewmodel/issue-card.js';
import { mapView } from '../../src/viewmodel/delegation-map.js';
import { cohortView } from '../../src/viewmodel/cohort-detail.js';
import { coverageView } from '../../src/viewmodel/coverage.js';
import { calibrationView } from '../../src/viewmodel/calibration.js';
import { sprintView } from '../../src/viewmodel/sprint.js';
import { settingsView } from '../../src/viewmodel/settings.js';
import {
  calibrationRow, card, cohortOutput, coverage, decision, delegationMap,
  epoch, involvement, pattern, settings, workItem,
} from './fixtures.js';

const fr = createTranslator('fr');

/** Every view the app can project, from a hand-built domain game. */
function allViews(): readonly unknown[] {
  return [
    cardView(card(), fr),
    cardView(null, fr),
    issuePanelView(card(), decision(), involvement(), fr),
    mapView(delegationMap(), fr),
    cohortView(cohortOutput(), fr),
    cohortView(cohortOutput({ masked: true, peopleCount: 2 }), fr),
    coverageView(coverage(), fr),
    calibrationView([calibrationRow('delegate', 41, 0.83, 0.69, 0.91)], false, fr),
    sprintView([workItem()], fr),
    settingsView(settings(), [pattern()], [epoch()], fr),
  ];
}

describe('no view carries a person identifier (DP-17, recipe 12)', () => {
  it('every projected view is person-safe', () => {
    for (const view of allViews()) {
      expect(personIdentifierLeak(view)).toBeNull();
      expect(isPersonSafe(view)).toBe(true);
    }
  });

  it('a masked cohort leaks no figure and no person', () => {
    const view = cohortView(cohortOutput({ masked: true, peopleCount: 2 }), fr);
    expect(isPersonSafe(view)).toBe(true);
    expect(JSON.stringify(view)).not.toContain('2 personnes');
  });

  it('the domain guard really catches a person field (guards the guard)', () => {
    expect(personIdentifierLeak({ reviewer: 'someone' })).toBe('reviewer');
    expect(personIdentifierLeak({ stats: { authorAccountId: 'x' } })).toBe('stats.authorAccountId');
  });
});

describe('viewmodels stay pure (SPEC §20, docs/CONTRACTS.md §L8)', () => {
  const dir = 'src/viewmodel';
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));

  it('imports no @forge/* and reads no clock', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(join(dir, name), 'utf8');
      const imports = source.split('\n').filter((line) => line.startsWith('import'));
      for (const line of imports) {
        expect(line, `${name} imports @forge`).not.toContain('@forge/');
      }
      expect(source, `${name} reads Date.now`).not.toContain('Date.now');
      expect(source, `${name} builds a Date`).not.toMatch(/new Date\(/);
    }
  });
});
