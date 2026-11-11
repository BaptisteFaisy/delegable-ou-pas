/**
 * Recommendation (SPEC §8 "La règle", "Les garde-fous", "Confiance";
 * DP-11, DP-12, DP-20).
 *
 * Four pieces:
 * - `guardrails`: the three guardrails that forbid "delegate" whatever the
 *   figures say, and say which one fired (recipe 9);
 * - `recommendFrom`: the table that turns a conclusion, a balance and a delay
 *   judgement into one of the four recommendations;
 * - `confidenceOf`: how much the figures behind a recommendation are worth;
 * - `createRecommendationEngine`: the single gate every screen, the MCP tool
 *   and the delegation map read from (SPEC §16.1, §20 "Rapidité", DP-20).
 *
 * Pure module: no `@forge/*`, no `Date.now()`, no network; the clock enters
 * through `Clock` (src/ports.ts). Imports carry the `.js` extension.
 */
import type { Balance, Conclusion, ProportionStat, Zone } from '../types.js';
import type {
  Confidence,
  Guardrail,
  ProjectSettings,
  Recommendation,
} from '../types-advice.js';
import type {
  Clock,
  CohortStatStore,
  DecisionStore,
  EpochStore,
  InvolvementStore,
  IssueClassStore,
  OutcomeStore,
  RecommendationEngine,
  RecommendationStore,
  ReviewFactStore,
  SettingsStore,
} from '../ports.js';

/** Sample size of the narrowest arm needed for "high" confidence (SPEC §8). */
export const CONFIDENCE_HIGH_N: number = 40;
/** Sample size of the narrowest arm needed for "medium" confidence. */
export const CONFIDENCE_MEDIUM_N: number = 20;
/** Width of the widest interval below which confidence is "high". */
export const CONFIDENCE_HIGH_WIDTH: number = 0.2;
/** Width of the widest interval below which confidence stays "medium". */
export const CONFIDENCE_MEDIUM_WIDTH: number = 0.4;

/** The width of an interval; a missing arm is as wide as it gets (SPEC §20). */
function intervalWidth(stat: ProportionStat | null): number {
  return stat === null ? 1 : stat.ciHigh - stat.ciLow;
}

/**
 * The three guardrails of SPEC §8, in the order of the SPEC, when they fire
 * (DP-12, recipe 9): an open incident, a sensitive zone, or missing acceptance
 * criteria. A non-empty result forbids `delegate`.
 */
export function guardrails(
  hasOpenIncident: boolean,
  zone: Zone,
  sensitiveZones: readonly Zone[],
  hasAcceptanceCriteria: boolean,
): readonly Guardrail[] {
  const fired: Guardrail[] = [];
  if (hasOpenIncident) fired.push('open-incident');
  if (sensitiveZones.includes(zone)) fired.push('sensitive-zone');
  if (!hasAcceptanceCriteria) fired.push('missing-acceptance-criteria');
  return fired;
}

/**
 * The table of SPEC §8 applied to an established (or not) comparison.
 *
 * - `not-enough-data` and unbalanced arms stay "we do not know";
 * - an established "worse" keeps the ticket for a human;
 * - otherwise the agent does not close worse: the advice is `delegate`, except
 *   when the delay is better but the clean closure is not clearly better
 *   (`same`), where it softens to `delegate-with-review`;
 * - a guardrail that fired demotes `delegate` to `delegate-with-review`
 *   (DP-12, recipe 9).
 */
export function recommendFrom(
  conclusion: Conclusion,
  balance: Balance,
  guardrails: readonly Guardrail[],
  delayBetter: boolean,
): Recommendation {
  if (conclusion === 'not-enough-data' || !balance.balanced) return 'not-enough-data';
  if (conclusion === 'worse') return 'keep-human';
  const candidate: Recommendation =
    conclusion === 'same' && delayBetter ? 'delegate-with-review' : 'delegate';
  if (candidate === 'delegate' && guardrails.length > 0) return 'delegate-with-review';
  return candidate;
}

/**
 * How much the figures behind a recommendation are worth (SPEC §8 "Confiance"):
 * a function of the narrowest arm, the widest interval, and the conclusion.
 * "We do not know" is never more than `low`.
 */
export function confidenceOf(
  agent: ProportionStat | null,
  human: ProportionStat | null,
  conclusion: Conclusion,
): Confidence {
  if (conclusion === 'not-enough-data') return 'low';
  const n = Math.min(agent?.n ?? 0, human?.n ?? 0);
  const width = Math.max(intervalWidth(agent), intervalWidth(human));
  if (n >= CONFIDENCE_HIGH_N && width <= CONFIDENCE_HIGH_WIDTH) return 'high';
  if (n >= CONFIDENCE_MEDIUM_N && width <= CONFIDENCE_MEDIUM_WIDTH) return 'medium';
  return 'low';
}

/**
 * What must hold for the advice to be followed (SPEC §8 "Conditions"). Only a
 * `delegate-with-review` asks for the project's own definition of strengthened
 * review; the other recommendations carry no condition of their own here.
 */
export function conditionsFor(
  value: Recommendation,
  settings: ProjectSettings,
): readonly string[] {
  if (value !== 'delegate-with-review') return [];
  const review = settings.hardenedReview;
  const conditions: string[] = [
    `relecture renforcée : au moins ${review.minReviewers} relecteurs`,
  ];
  if (review.zoneOwnerRequired) conditions.push('un relecteur responsable de la zone est requis');
  if (review.evidencePerCriterion) conditions.push("une preuve par critère d'acceptation");
  return conditions;
}

/** The stores and ports the recommendation engine needs (SPEC §8, §20). */
export interface RecommendationDeps {
  readonly settings: SettingsStore;
  readonly epochs: EpochStore;
  readonly cohorts: CohortStatStore;
  readonly classes: IssueClassStore;
  readonly outcomes: OutcomeStore;
  readonly involvements: InvolvementStore;
  readonly recommendations: RecommendationStore;
  readonly decisions: DecisionStore;
  readonly reviews: ReviewFactStore;
  readonly clock: Clock;
}

/**
 * The single path to a recommendation (SPEC §16.1, §15, §20, DP-20).
 *
 * The cached card is the source of truth: the nightly job computes and saves
 * it, every reader reads the same row, and nothing is recomputed twice.
 * `compute` reads the same row as `read` until the issue→project routing is
 * wired by the runtime (CONTRACT-NEEDED: ports.RecommendationEngine.compute —
 * deps lack an issueId→projectId resolver). The delegation map (DP-14,
 * SPEC §12) is lot L8's screen work, so `map` returns `null` for now
 * (CONTRACT-NEEDED: ports.RecommendationEngine.map).
 */
export function createRecommendationEngine(deps: RecommendationDeps): RecommendationEngine {
  return {
    read: (issueId: string) => deps.recommendations.get(issueId),
    compute: (issueId: string) => deps.recommendations.get(issueId),
    map: (_projectId: string, _sprintId: string) => Promise.resolve(null),
  };
}