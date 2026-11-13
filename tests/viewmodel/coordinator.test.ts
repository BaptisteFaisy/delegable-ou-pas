/**
 * The night queue and the morning report, as a screen shows it (SPEC §27).
 */
import { describe, expect, it } from 'vitest';
import { coordinatorView, morningView } from '../../src/viewmodel/coordinator.js';
import type { NightCandidate, NightOutcome } from '../../src/domain/coordinator.js';

function candidate(over: Partial<NightCandidate> = {}): NightCandidate {
  return {
    issueKey: 'PROJ-1',
    cohortKey: 'bugfix-billing-M',
    recommendation: 'delegate',
    ready: true,
    urgent: false,
    sensitive: false,
    hasCriteria: true,
    reviewable: true,
    collision: false,
    estimateMinutes: 30,
    ...over,
  };
}

describe('coordinatorView', () => {
  it('se rend sans candidat', () => {
    const view = coordinatorView([], 120);
    expect(view.taken).toEqual([]);
    expect(view.skipped).toEqual([]);
    expect(view.budgetMinutes).toBe(120);
  });

  it('prend un ticket éligible', () => {
    const view = coordinatorView([candidate()], 120);
    expect(view.taken).toEqual(['PROJ-1']);
    expect(view.skipped).toEqual([]);
  });

  it('nomme la raison de chaque exclusion', () => {
    const view = coordinatorView(
      [
        candidate({ issueKey: 'PROJ-1', ready: false }),
        candidate({ issueKey: 'PROJ-2', sensitive: true }),
        candidate({ issueKey: 'PROJ-3', collision: true }),
        candidate({ issueKey: 'PROJ-4', recommendation: 'keep-human' }),
      ],
      120,
    );
    expect(view.taken).toEqual([]);
    expect(view.skipped.map((item) => item.reason)).toEqual([
      'not-ready',
      'sensitive',
      'collision',
      'not-delegable',
    ]);
    expect(view.skipped[0].reasonLabel.fr.length).toBeGreaterThan(0);
    expect(view.skipped[0].reasonLabel.en.length).toBeGreaterThan(0);
  });

  it('respecte le budget de la nuit', () => {
    const view = coordinatorView(
      [
        candidate({ issueKey: 'PROJ-1', estimateMinutes: 100 }),
        candidate({ issueKey: 'PROJ-2', estimateMinutes: 100 }),
      ],
      120,
    );
    expect(view.taken).toEqual(['PROJ-1']);
    expect(view.skipped[0].reason).toBe('budget');
  });

  it('parle français et anglais', () => {
    const view = coordinatorView([candidate()], 120);
    expect(view.title.fr).not.toBe(view.title.en);
    expect(view.note.fr).not.toBe(view.note.en);
  });
});

describe('morningView', () => {
  it('se rend sans ticket pris', () => {
    const plan = coordinatorView([], 120);
    const view = morningView(plan, [], 'fr');
    expect(view.taken).toEqual([]);
    expect(view.proven).toEqual([]);
    expect(view.reopened).toBe(0);
    expect(view.cleanClosed).toBeNull();
  });

  it('compte les preuves, les réouvertures et la clôture propre', () => {
    const plan = coordinatorView([candidate({ issueKey: 'PROJ-1' }), candidate({ issueKey: 'PROJ-2' })], 120);
    const outcomes: NightOutcome[] = [
      { issueKey: 'PROJ-1', clean: true, reopened: false, proven: true },
      { issueKey: 'PROJ-2', clean: false, reopened: true, proven: false },
    ];
    const view = morningView(plan, outcomes, 'fr');
    expect(view.proven).toEqual(['PROJ-1']);
    expect(view.reopened).toBe(1);
    expect(view.cleanClosed).not.toBeNull();
    expect(view.cleanClosed?.n).toBe(2);
    expect(view.cleanClosed?.text).toContain('n = 2');
    expect(view.note.fr).not.toBe(view.note.en);
  });
});
