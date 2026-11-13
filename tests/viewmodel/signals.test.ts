/**
 * The weak signals of the involvement, as a screen shows it (SPEC §5; DP-02,
 * DP-03, DP-19).
 */
import { describe, expect, it } from 'vitest';
import { signalsView, unknownPlanView } from '../../src/viewmodel/signals.js';
import type { SignalCommit, WeakSignal } from '../../src/domain/signals.js';

const COMMITS: readonly SignalCommit[] = [
  { filesTouched: 3, linesChanged: 120, authorIsBot: true, hasSignature: true, committedAt: '2026-11-02T09:00:00Z' },
  { filesTouched: 2, linesChanged: 90, authorIsBot: true, hasSignature: true, committedAt: '2026-11-02T10:00:00Z' },
];

/** A calibrated signal: its precision is known. */
const CALIBRATED: readonly WeakSignal[] = [
  {
    id: 'bot-author',
    label: { fr: 'auteur robot', en: 'bot author' },
    weight: 0.35,
    precision: 0.8,
    calibratable: true,
  },
];

describe('signalsView', () => {
  it('se rend sans commit', () => {
    const view = signalsView([], CALIBRATED, 'fr');
    expect(view.score).toBe(0);
    expect(view.reasons).toEqual([]);
    expect(view.confidence).toBeNull();
    expect(view.uncalibrated).toBe(true);
    expect(view.uncalibratedNotice).not.toBeNull();
  });

  it('score un ticket qui déclenche un signal calibré', () => {
    const view = signalsView(COMMITS, CALIBRATED, 'fr');
    expect(view.score).toBeGreaterThan(0);
    expect(view.reasons.map((reason) => reason.id)).toContain('bot-author');
    expect(view.confidence).not.toBeNull();
    expect(view.confidence?.n).toBeGreaterThan(0);
    expect(view.confidence?.text).toContain('n =');
    expect(view.uncalibrated).toBe(false);
  });

  it('ne mesure aucune précision quand le signal n’est pas calibré', () => {
    const view = signalsView(COMMITS, [{ ...CALIBRATED[0], precision: null }], 'fr');
    expect(view.reasons.length).toBeGreaterThan(0);
    expect(view.confidence).toBeNull();
    expect(view.uncalibratedNotice?.fr).toContain('calibré');
  });

  it('rappelle qu’un score n’est pas une preuve', () => {
    const view = signalsView(COMMITS, CALIBRATED, 'fr');
    expect(view.notAProof.fr).toContain('preuve');
    expect(view.notAProof.en).toContain('proof');
  });

  it('parle français et anglais', () => {
    const view = signalsView(COMMITS, CALIBRATED, 'fr');
    expect(view.title.fr).not.toBe(view.title.en);
    expect(view.reasons[0].note.fr).not.toBe(view.reasons[0].note.en);
  });
});

describe('unknownPlanView', () => {
  it('se rend sans candidat', () => {
    const view = unknownPlanView([], {}, {}, 3);
    expect(view.issueIds).toEqual([]);
    expect(view.coverageShare).toBe(0);
  });

  it('ordonne les tickets par information gagnée et respecte le budget', () => {
    const view = unknownPlanView(
      [
        { issueKey: 'PROJ-1', cohortKey: 'big' },
        { issueKey: 'PROJ-2', cohortKey: 'small' },
      ],
      { big: 100, small: 10 },
      { 'PROJ-1': 0.2, 'PROJ-2': 0.9 },
      1,
    );
    expect(view.issueIds).toEqual(['PROJ-2']);
    expect(view.lines[0].expectedGainText).toContain('%');
    expect(view.lines[0].note.fr).not.toBe(view.lines[0].note.en);
  });
});
