/**
 * SPEC §4, §7 rule 6, §12 · DP-20, DP-22 — the three epochs of the demo.
 *
 * An epoch is a period during which the agents did not change: same tool,
 * same model, same instructions (SPEC §4 "Époque"). The third one opens on
 * 14 September with a new model, exactly as the SPEC quotes it (SPEC §12):
 * "Depuis l'époque 3 (nouveau modèle, 14 septembre), les migrations de
 * données sont passées du rouge à l'orange."
 */
import type { Epoch } from '../types.js';
import { SAMPLE_PROJECT_ID } from './project.js';

/** First epoch: the first tools, the first shared instructions. */
export const EPOCH_1 = 'epoch-1';

/** Second epoch: the same tools and model, new shared instructions. */
export const EPOCH_2 = 'epoch-2';

/** Third epoch: the new model, from 14 September 2026 (SPEC §12). */
export const EPOCH_3 = 'epoch-3';

/** The three epochs of the demo project (SPEC §24.1: twelve months, three epochs). */
export function sampleEpochs(): readonly Epoch[] {
  return [
    {
      id: EPOCH_1,
      projectId: SAMPLE_PROJECT_ID,
      startsAt: '2025-12-01',
      label: 'outils initiaux, consignes v1 / first tools, rules v1',
      client: 'code-agent',
      model: 'model-a-2025',
      instructionsVersion: 'v1',
    },
    {
      id: EPOCH_2,
      projectId: SAMPLE_PROJECT_ID,
      startsAt: '2026-04-06',
      label: 'consignes partagées v2 / shared rules v2',
      client: 'code-agent',
      model: 'model-a-2025',
      instructionsVersion: 'v2',
    },
    {
      id: EPOCH_3,
      projectId: SAMPLE_PROJECT_ID,
      startsAt: '2026-09-14',
      label: 'nouveau modèle, 14 septembre / new model, 14 September',
      client: 'code-agent',
      model: 'model-b-2026',
      instructionsVersion: 'v2',
    },
  ];
}

/**
 * The epoch a date falls in: the last one that started at or before it
 * (SPEC §7 rule 6). The demo window starts with the first epoch, so a date
 * before it still belongs to it — the demo never mixes two epochs.
 */
export function epochOfDate(epochs: readonly Epoch[], at: string): Epoch {
  const instant = Date.parse(at);
  let found = epochs[0];
  for (const epoch of epochs) {
    if (Date.parse(epoch.startsAt) <= instant) found = epoch;
  }
  return found;
}

/** The current epoch of the demo: the last one that started (SPEC §12). */
export function currentSampleEpoch(epochs: readonly Epoch[] = sampleEpochs()): Epoch {
  return epochs[epochs.length - 1];
}
