/**
 * Mapping layer, single entry point (SPEC §17, SPEC §18, DP-18, DP-19).
 *
 * One file per family, so each stays well under 500 lines, and one shared
 * codec (`mapping-codec.ts`) so a JSON payload, a boolean flag or a cohort
 * key is written exactly the same way everywhere:
 *
 * - `mapping-codec.ts` — stable JSON, 0/1 flags, cohort key, evidence;
 * - `mapping-involvement.ts` — involvement, signature patterns (DP-01, DP-02);
 * - `mapping-outcome.ts` — commit facts, review facts, outcomes (DP-04, DP-05);
 * - `mapping-stats.ts` — classifications, epochs, cohorts, calibration;
 * - `mapping-advice.ts` — cards, decisions, trials (DP-11, DP-13, DP-27);
 * - `mapping-collection.ts` — cursor, settings, coverage (DP-18, DP-19).
 *
 * The property every family honours: an object written then read back is the
 * same object — booleans as 0/1, dates as ISO 8601 UTC verbatim, `null` and
 * empty lists preserved (SPEC §20 "données absentes").
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
export {
  asNumber,
  asText,
  decodeCohortKey,
  decodeJsonArray,
  decodeJsonObject,
  decodeEvidence,
  EMPTY_COHORT_KEY,
  encodeCohortKey,
  encodeEvidence,
  encodeJson,
  fromFlag,
  toFlag,
} from './mapping-codec.js';

export {
  toInvolvement,
  toInvolvementRow,
  toSeenSignature,
  toSignaturePattern,
  toSignaturePatternRow,
} from './mapping-involvement.js';

export {
  toCommitFact,
  toCommitFactRow,
  toOutcome,
  toOutcomeRow,
  toReviewFact,
  toReviewFactRow,
} from './mapping-outcome.js';

export {
  toCalibration,
  toCalibrationRow,
  toCohortStat,
  toCohortStatRow,
  toEpoch,
  toEpochRow,
  toIssueClass,
  toIssueClassRow,
} from './mapping-stats.js';

export {
  takenOf,
  toDecision,
  toDecisionRow,
  toRecommendationCard,
  toRecommendationRow,
  toTrial,
  toTrialAssignment,
  toTrialAssignmentRow,
  toTrialRow,
} from './mapping-advice.js';

export {
  toCoverage,
  toCoverageRow,
  toGraphCursor,
  toGraphCursorRow,
  toProjectSettings,
  toSettingsRow,
} from './mapping-collection.js';
