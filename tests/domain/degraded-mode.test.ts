/**
 * Tests of the degraded mode: the three capability levels, the written
 * consequences, the widened threshold and the refusal to conclude
 * (SPEC §7 rule 2, SPEC §17, SPEC §21, SPEC §26; DP-19).
 */
import { describe, expect, it } from 'vitest';
import type { Balance } from '../../src/types.js';
import {
  assessCapabilities,
  probeFromState,
  widenThresholdForLevel,
  type GraphPermissionState,
} from '../../src/domain/degraded-mode.js';
import { conclude } from '../../src/domain/conclusion.js';
import { proportion } from '../../src/domain/stats.js';

const GRAPH_OBJECTS = ['commit', 'pull-request', 'issue', 'user'] as const;

/** A right that was probed and granted. */
function granted(object: string): GraphPermissionState {
  return { object, granted: true, probed: true };
}

/** A right that was probed and refused. */
function missing(object: string): GraphPermissionState {
  return { object, granted: false, probed: true };
}

const FULL: readonly GraphPermissionState[] = [granted('jira'), ...GRAPH_OBJECTS.map(object => granted(object))];
const JIRA_ONLY: readonly GraphPermissionState[] = [granted('jira'), ...GRAPH_OBJECTS.map(object => missing(object))];
const DECLARED_ONLY: readonly GraphPermissionState[] = [missing('jira'), ...GRAPH_OBJECTS.map(object => missing(object))];

/** Two arms of 24 tickets each, balanced in volume (SPEC §7 rule 5). */
const BALANCED: Balance = { balanced: true, signals: [] };

describe('les trois niveaux de capacité', () => {
  it('garde tout mesurable quand Jira et le graphe sont accordés', () => {
    const report = assessCapabilities(FULL);
    expect(report.level).toBe('full');
    expect(report.unavailable).toEqual([]);
    expect(report.consequences).toEqual([]);
    expect(report.available.some(label => label.startsWith('review-load'))).toBe(true);
  });

  it('vide le graphe en Jira seul, et l’écrit', () => {
    const report = assessCapabilities(JIRA_ONLY);
    expect(report.level).toBe('jira-only');
    expect(report.available.some(label => label.startsWith('lead-time'))).toBe(true);
    expect(report.unavailable.some(label => label.startsWith('review-load'))).toBe(true);
    expect(report.consequences.length).toBeGreaterThan(0);
    expect(report.consequences.some(text => text.includes('jamais rendue comme un zéro'))).toBe(true);
    expect(report.consequences.some(text => text.includes('élargi de moitié'))).toBe(true);
  });

  it('vide aussi Jira en déclaré seul, et l’écrit', () => {
    const report = assessCapabilities(DECLARED_ONLY);
    expect(report.level).toBe('declared-only');
    expect(report.available.some(label => label.startsWith('declared-involvement'))).toBe(true);
    expect(report.unavailable.some(label => label.startsWith('clean-closure'))).toBe(true);
    expect(report.consequences.some(text => text.includes('ne peut plus reposer sur les réouvertures'))).toBe(true);
    expect(report.consequences.some(text => text.includes('doublé'))).toBe(true);
  });

  it('traite un droit jamais sondé comme absent, et l’écrit', () => {
    const report = assessCapabilities([granted('jira'), { object: 'commit', granted: false, probed: false }]);
    expect(report.level).toBe('jira-only');
    expect(report.consequences.some(text => text.includes('jamais sondé'))).toBe(true);
  });

  it('convertit l’union gelée vers l’état sondé local', () => {
    expect(probeFromState('commit', 'granted')).toEqual({ object: 'commit', granted: true, probed: true });
    expect(probeFromState('commit', 'missing')).toEqual({ object: 'commit', granted: false, probed: true });
    expect(probeFromState('commit', 'unknown')).toEqual({ object: 'commit', granted: false, probed: false });
  });
});

describe('le seuil élargi pour refuser de conclure', () => {
  it('élargit ×1, ×1,5 puis ×2', () => {
    expect(widenThresholdForLevel('full', 20)).toBe(20);
    expect(widenThresholdForLevel('jira-only', 20)).toBe(30);
    expect(widenThresholdForLevel('declared-only', 20)).toBe(40);
  });

  it('arrondit au ticket entier et refuse tout seuil illisible', () => {
    expect(widenThresholdForLevel('jira-only', 7)).toBe(11);
    expect(widenThresholdForLevel('declared-only', Number.NaN)).toBe(Number.POSITIVE_INFINITY);
  });

  it('conclut en mode complet et refuse là où le repli n’a plus la matière', () => {
    const agent = proportion(21, 24);
    const human = proportion(3, 24);
    const full = conclude(agent, human, widenThresholdForLevel('full', 20), BALANCED);
    expect(full).toBe('better');
    const fallback = conclude(agent, human, widenThresholdForLevel('jira-only', 20), BALANCED);
    expect(fallback).toBe('not-enough-data');
    const declared = conclude(agent, human, widenThresholdForLevel('declared-only', 20), BALANCED);
    expect(declared).toBe('not-enough-data');
  });
});

describe('aucun écran ne peut rendre une charge de relecture en Jira seul', () => {
  it('ne propose la relecture ni en disponible ni en mesurable', () => {
    const report = assessCapabilities(JIRA_ONLY);
    expect(report.available.filter(label => label.startsWith('review-load'))).toEqual([]);
    expect(report.unavailable.filter(label => label.startsWith('review-load')).length).toBe(1);
    // The consequence names the absence in both languages, never a number.
    const consequence = report.consequences.find(text => text.startsWith('review load'));
    expect(consequence).toBeDefined();
    expect(consequence).toContain('not measurable here');
    expect(consequence).toContain('non mesurable ici');
    expect(consequence).not.toMatch(/\b0\b/);
  });
});