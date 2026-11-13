/**
 * Tests of the weak signals.
 *
 * The point of the module: the signals are a **prioritiser**, never a proof.
 * The tests therefore check that an uncalibrated signal stays silent, that a
 * calibrated one reports its measured precision, that the confidence travels
 * as a proportion (sample size and interval), and that the collection plan
 * orders the tickets by the information they would settle.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIGNALS,
  calibrateSignal,
  extractFeatures,
  prioritiseUnknown,
  scoreInvolvement,
} from '../../src/domain/signals.js';
import type { SignalCommit, WeakSignal } from '../../src/domain/signals.js';

const COMMITS: readonly SignalCommit[] = [
  { filesTouched: 3, linesChanged: 120, authorIsBot: true, hasSignature: true, committedAt: '2026-12-01T10:00:00Z' },
  { filesTouched: 2, linesChanged: 90, authorIsBot: true, hasSignature: true, committedAt: '2026-12-01T11:00:00Z' },
  { filesTouched: 1, linesChanged: 40, authorIsBot: true, hasSignature: false, committedAt: '2026-12-01T12:00:00Z' },
];

describe('extraction des caractéristiques', () => {
  it('additionne les commits et compte les signatures', () => {
    const features = extractFeatures(COMMITS);
    expect(features.commits).toBe(3);
    expect(features.filesTouched).toBe(6);
    expect(features.linesChanged).toBe(250);
    expect(features.botAuthor).toBe(true);
    expect(features.signedShare).toBeCloseTo(2 / 3, 3);
  });

  it('mesure la régularité horaire', () => {
    const features = extractFeatures([
      { filesTouched: 1, linesChanged: 10, authorIsBot: false, hasSignature: false, committedAt: '2026-12-01T09:00:00Z' },
      { filesTouched: 1, linesChanged: 10, authorIsBot: false, hasSignature: false, committedAt: '2026-12-01T03:00:00Z' },
    ]);
    expect(features.regularity).toBeCloseTo(0.5, 3);
  });

  it('un ticket sans commit ne plante pas', () => {
    const features = extractFeatures([]);
    expect(features.commits).toBe(0);
    expect(features.signedShare).toBe(0);
    expect(features.botAuthor).toBe(false);
  });
});

describe('score d’implication par signaux faibles', () => {
  it('un signal non calibré ne produit pas de confiance affirmative', () => {
    const score = scoreInvolvement(extractFeatures(COMMITS));
    expect(score.score).toBeGreaterThan(0);
    expect(score.confidence.n).toBe(0);
    expect(score.confidence.rate).toBe(0);
    expect(score.reasons.length).toBeGreaterThan(0);
  });

  it('la note d’un signal calibrated porte sa précision mesurée', () => {
    const calibrated: WeakSignal[] = [
      { id: 'bot-author', label: { fr: 'auteur robot', en: 'bot author' }, weight: 0.5, precision: 0.9, calibratable: true },
    ];
    const score = scoreInvolvement(extractFeatures(COMMITS), calibrated);
    expect(score.confidence.rate).toBeCloseTo(0.9, 3);
    expect(score.confidence.n).toBeGreaterThan(0);
    expect(score.confidence.ciHigh).toBeGreaterThanOrEqual(score.confidence.rate);
    expect(score.reasons[0].note.fr).toContain('90 %');
  });

  it('un signal qui ne se déclenche pas ne pèse rien', () => {
    const score = scoreInvolvement(extractFeatures([]), DEFAULT_SIGNALS);
    expect(score.score).toBe(0);
    expect(score.reasons).toHaveLength(0);
  });

  it('la confiance sort avec son effectif et sa fourchette', () => {
    const score = scoreInvolvement(extractFeatures(COMMITS));
    expect(score.confidence).toHaveProperty('ciLow');
    expect(score.confidence).toHaveProperty('ciHigh');
    expect(score.confidence.ciLow).toBeLessThanOrEqual(score.confidence.rate);
  });
});

describe('calibration d’un signal', () => {
  it('mesure la précision sur des exemples étiquetés', () => {
    const examples = [
      { features: extractFeatures(COMMITS), labelledAgent: true },
      { features: extractFeatures(COMMITS), labelledAgent: true },
      { features: extractFeatures(COMMITS), labelledAgent: false },
    ];
    expect(calibrateSignal('bot-author', examples)).toBeCloseTo(2 / 3, 3);
  });

  it('un signal qui ne se déclenche jamais a une précision nulle, pas une affirmation', () => {
    expect(calibrateSignal('bot-author', [])).toBe(0);
  });
});

describe('plan de collecte des inconnus', () => {
  const candidates = [
    { issueKey: 'PROJ-1', cohortKey: 'thin' },
    { issueKey: 'PROJ-2', cohortKey: 'wide' },
  ];
  const cohortSizes = { thin: 10, wide: 100 };
  const scores = { 'PROJ-1': 0.9, 'PROJ-2': 0.5 };

  it('commence par le ticket qui tranche le plus d’information', () => {
    const plan = prioritiseUnknown(candidates, cohortSizes, scores, 1);
    expect(plan.issueIds).toEqual(['PROJ-1']);
    expect(plan.rationale[0].expectedGain).toBeGreaterThan(0);
    expect(plan.rationale[0].note.fr).toContain('information');
  });

  it('respecte le budget et rend la part couverte', () => {
    const plan = prioritiseUnknown(candidates, cohortSizes, scores, 2);
    expect(plan.issueIds).toHaveLength(2);
    expect(plan.coverageShare).toBe(1);
  });

  it('un budget nul ne collecte rien', () => {
    const plan = prioritiseUnknown(candidates, cohortSizes, scores, 0);
    expect(plan.issueIds).toHaveLength(0);
    expect(plan.coverageShare).toBe(0);
  });

  it('aucun candidat ne plante pas', () => {
    const plan = prioritiseUnknown([], {}, {}, 5);
    expect(plan.issueIds).toHaveLength(0);
    expect(plan.coverageShare).toBe(0);
  });
});
