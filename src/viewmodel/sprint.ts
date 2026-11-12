/**
 * The sprint split as a screen shows it (SPEC §16.4, §12 "La part délégable
 * d'un sprint"; DP-24, recipe 13).
 *
 * Two projections: the tickets an orchestrator may take, from the safest to the
 * least safe (recipe 13), and the share of the sprint's points that are "hand it
 * to an agent" — the sentence of DP-24, "38 % des points du sprint 42 sont à
 * confier".
 *
 * Pure module: no `@forge/*`, no clock.
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { DelegableWorkItem } from '../types-mcp.js';
import type { Confidence } from '../types-advice.js';
import { percent } from '../domain/stats.js';
import type { Translate } from '../i18n/index.js';
import { confidenceLabel } from './common.js';

/** One ticket an agent may take, safest first (SPEC §9, recipe 13). */
export interface SprintItemView {
  readonly issueKey: string;
  readonly confidence: Confidence;
  readonly confidenceLine: string;
  /** Why this ticket is safe, in one line (SPEC §8). */
  readonly reasons: readonly string[];
}

/** The sprint screen (SPEC §16.4). */
export interface SprintView {
  readonly title: string;
  readonly countLine: string;
  readonly items: readonly SprintItemView[];
  readonly anonymityNotice: string;
}

/**
 * Projects the tickets of a sprint that can be entrusted to an agent. An empty
 * list is normal data: it says so instead of rendering nothing (SPEC §20).
 */
export function sprintView(items: readonly DelegableWorkItem[], t: Translate): SprintView {
  return {
    title: t('ui.screen.sprint'),
    countLine: items.length === 0
      ? t('stats.sprint-empty')
      : t('stats.sprint-count', { count: items.length }),
    items: items.map((item) => ({
      issueKey: item.issueKey,
      confidence: item.confidence,
      confidenceLine: confidenceLabel(item.confidence, t),
      reasons: [...item.reasons],
    })),
    anonymityNotice: t('ui.anonymity'),
  };
}

/** The delegable share of a sprint, as one sentence (DP-24). */
export interface SprintShareView {
  /** True when a sprint was given: without one there is no share to show. */
  readonly hasSprint: boolean;
  readonly sprintId: string;
  readonly shareLine: string;
}

/**
 * Projects the share of the sprint's points that are to be entrusted to an
 * agent. No sprint given means no share computed, and the screen says so
 * instead of showing a zero (SPEC §20).
 */
export function sprintShareView(
  delegableShare: number,
  sprintId: string,
  t: Translate,
): SprintShareView {
  if (sprintId === '') {
    return { hasSprint: false, sprintId: '', shareLine: t('stats.no-sprint') };
  }
  return {
    hasSprint: true,
    sprintId,
    shareLine: t('stats.delegable-share', {
      share: percent(delegableShare),
      sprint: sprintId,
    }),
  };
}
