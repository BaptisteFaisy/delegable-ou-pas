/**
 * The decision actually taken on a ticket (SPEC §8 "Un avis, pas un ordre",
 * SPEC §12 "Les écarts à la recommandation"; DP-13).
 *
 * The decision is never a judgement on a person and never blocks anything: it
 * records what was decided, whether it followed the displayed advice, and
 * feeds the calibration (SPEC §10). A missing card is normal (SPEC §20): the
 * decision is kept with `followed = false`.
 */
import type { Level } from '../types.js';
import type { Decision, RecommendationCard } from '../types-advice.js';

/**
 * True when the decision followed the recommendation displayed at the time
 * (SPEC §13): `delegate` follows the two agent advices, `keep-human` follows
 * the two "hand it to a human or we do not know" advices. A missing card never
 * "followed" anything (SPEC §20).
 */
export function followed(
  card: RecommendationCard | null,
  taken: 'delegate' | 'keep-human',
): boolean {
  if (card === null) return false;
  if (taken === 'delegate') {
    return card.value === 'delegate' || card.value === 'delegate-with-review';
  }
  return card.value === 'keep-human' || card.value === 'not-enough-data';
}

/**
 * Records the decision, followed or not, with the involvement level that the
 * ticket really got afterwards (SPEC §6 "Reprise humaine", §18 table `decision`,
 * DP-13). The decision is kept even when no card was shown (SPEC §20).
 */
export function recordDecision(
  issueId: string,
  taken: 'delegate' | 'keep-human',
  reason: string,
  card: RecommendationCard | null,
  actualLevel: Level,
  at: string,
): Decision {
  return {
    issueId,
    taken,
    followed: followed(card, taken),
    actualLevel,
    reason,
    at,
  };
}