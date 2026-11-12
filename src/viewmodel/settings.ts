/**
 * The project settings screen as a projection (SPEC §16.5, §13 "La date
 * d'adoption", §5 "Les mentions de commit"; DP-02, DP-12, DP-22).
 *
 * The screen shows what the project declared: the commit-mention catalogue with
 * the mentions really seen, the adoption date, the natures, the zones, the
 * sizes, the sample-size threshold, the sensitive zones, the project's own
 * definition of "hardened review", and the epochs.
 *
 * The app never invents the hardened-review rule: it displays the one the
 * project wrote (SPEC §8). Absent data is normal: an empty catalogue, no
 * adoption date, no sensitive zone all render their explicit sentence.
 *
 * Pure module: no `@forge/*`, no clock.
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { HardenedReview, ProjectSettings } from '../types-advice.js';
import type { Epoch, SignaturePattern } from '../types.js';
import type { Translate } from '../i18n/index.js';
import type { DemoNotice } from './common.js';
import { demoNotice } from './common.js';

/** One commit-mention pattern of the catalogue, with how often it was seen (DP-02). */
export interface PatternView {
  readonly agentName: string;
  readonly enabled: boolean;
  readonly seenCount: number;
  readonly line: string;
}

/** One epoch of the project (SPEC §4 "Époque", DP-22). */
export interface EpochView {
  readonly id: string;
  readonly label: string;
  readonly startsAt: string;
}

/** The settings screen (SPEC §16.5). */
export interface SettingsView {
  readonly title: string;
  readonly projectKey: string;
  readonly adoptionLine: string;
  readonly thresholdLine: string;
  readonly natures: readonly string[];
  readonly zones: readonly string[];
  readonly sizes: readonly string[];
  readonly sensitiveZones: readonly string[];
  readonly sensitiveZonesTitle: string;
  readonly hardenedReviewLines: readonly string[];
  readonly waitingStatuses: readonly string[];
  readonly patterns: readonly PatternView[];
  readonly patternsTitle: string;
  readonly patternsToConfirm: readonly string[];
  readonly epochs: readonly EpochView[];
  readonly demo: DemoNotice | null;
}

/** The hardened-review definition, line by line, as the project wrote it (SPEC §8). */
function hardenedReviewLines(review: HardenedReview, t: Translate): readonly string[] {
  const parts = [t('docs.hardened-review.reviewers', { count: review.minReviewers })];
  if (review.zoneOwnerRequired) parts.push(t('docs.hardened-review.zone-owner'));
  if (review.evidencePerCriterion) parts.push(t('docs.hardened-review.evidence'));
  return [t('docs.hardened-review', { label: review.label }), ...parts];
}

/** One pattern projected; a mention never seen says so (DP-02). */
function patternView(pattern: SignaturePattern, t: Translate): PatternView {
  const line = pattern.enabled
    ? t('docs.commit-mention', { agent: pattern.agentName, count: pattern.seenCount })
    : t('docs.commit-mention.disabled', { agent: pattern.agentName });
  return { agentName: pattern.agentName, enabled: pattern.enabled, seenCount: pattern.seenCount, line };
}

/** The mentions really seen, to confirm: a non-zero `seenCount` (DP-02). */
function seenPatterns(patterns: readonly SignaturePattern[], t: Translate): readonly string[] {
  return patterns
    .filter((pattern) => pattern.enabled && pattern.seenCount > 0)
    .map((pattern) => t('docs.commit-mention', { agent: pattern.agentName, count: pattern.seenCount }));
}

/** The adoption-date line: declared or not, both said (SPEC §13, recipe 3). */
function adoptionLine(settings: ProjectSettings, t: Translate): string {
  return settings.adoptionDate === ''
    ? t('docs.no-adoption-date')
    : t('docs.adoption-date', { date: settings.adoptionDate });
}

/**
 * Projects the settings. `null` settings render the explicit empty screen; the
 * lists stay empty, never invented (SPEC §20).
 */
export function settingsView(
  settings: ProjectSettings | null,
  patterns: readonly SignaturePattern[],
  epochs: readonly Epoch[],
  t: Translate,
): SettingsView {
  if (settings === null) {
    return {
      title: t('ui.screen.settings'),
      projectKey: '',
      adoptionLine: t('docs.no-adoption-date'),
      thresholdLine: '',
      natures: [],
      zones: [],
      sizes: [],
      sensitiveZones: [],
      sensitiveZonesTitle: t('docs.no-sensitive-zone'),
      hardenedReviewLines: [],
      waitingStatuses: [],
      patterns: [],
      patternsTitle: t('docs.no-commit-mention'),
      patternsToConfirm: [],
      epochs: [],
      demo: null,
    };
  }
  return {
    title: t('ui.screen.settings'),
    projectKey: settings.projectKey,
    adoptionLine: adoptionLine(settings, t),
    thresholdLine: t('docs.min-arm-size', { n: settings.minArmSize }),
    natures: [...settings.natures],
    zones: [...settings.zones],
    sizes: [...settings.sizes],
    sensitiveZones: [...settings.sensitiveZones],
    sensitiveZonesTitle: settings.sensitiveZones.length === 0
      ? t('docs.no-sensitive-zone')
      : t('docs.sensitive-zones'),
    hardenedReviewLines: hardenedReviewLines(settings.hardenedReview, t),
    waitingStatuses: [...settings.waitingStatuses],
    patterns: patterns.map((pattern) => patternView(pattern, t)),
    patternsTitle: t('docs.commit-mentions'),
    patternsToConfirm: seenPatterns(patterns, t),
    epochs: epochs.map((epoch) => ({ id: epoch.id, label: epoch.label, startsAt: epoch.startsAt })),
    demo: demoNotice(settings.demo, t),
  };
}
