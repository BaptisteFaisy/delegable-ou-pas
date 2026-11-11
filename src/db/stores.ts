/**
 * The whole store, assembled (SPEC §17, SPEC §18, DP-13, DP-18, DP-19).
 *
 * `Stores` is the object the rest of the app consumes: one field per port of
 * `src/ports.ts`, in `camelCase`. Screens and tools read the database through
 * it and never through a statement written elsewhere (SPEC §18: the only lot
 * that writes SQL).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type {
  CalibrationStore,
  CohortStatStore,
  CommitFactStore,
  CoverageStore,
  DecisionStore,
  EpochStore,
  GraphCursorStore,
  InvolvementStore,
  IssueClassStore,
  OutcomeStore,
  RecommendationStore,
  ReviewFactStore,
  SettingsStore,
  SignatureStore,
  TrialStore,
} from '../ports.js';
import { createCalibrationStore } from './calibration.js';
import { createCohortStatStore } from './cohorts.js';
import { createCommitFactStore } from './commit-facts.js';
import { createCoverageStore } from './coverage.js';
import { createDecisionStore } from './decisions.js';
import { createEpochStore } from './epochs.js';
import { createGraphCursorStore } from './graph-cursor.js';
import { createInvolvementStore } from './involvement.js';
import { createIssueClassStore } from './issue-class.js';
import { createOutcomeStore } from './outcomes.js';
import { createRecommendationStore } from './recommendations.js';
import { createReviewFactStore } from './review-facts.js';
import { createSettingsStore } from './settings.js';
import { createSignatureStore } from './signatures.js';
import { createTrialStore } from './trials.js';
import type { SqlClient } from './sql-client.js';

/** One field per port of `src/ports.ts`, same name in `camelCase`. */
export interface Stores {
  readonly involvement: InvolvementStore;
  readonly signature: SignatureStore;
  readonly commitFact: CommitFactStore;
  readonly reviewFact: ReviewFactStore;
  readonly outcome: OutcomeStore;
  readonly issueClass: IssueClassStore;
  readonly epoch: EpochStore;
  readonly cohortStat: CohortStatStore;
  readonly recommendation: RecommendationStore;
  readonly decision: DecisionStore;
  readonly calibration: CalibrationStore;
  readonly trial: TrialStore;
  readonly graphCursor: GraphCursorStore;
  readonly settings: SettingsStore;
  readonly coverage: CoverageStore;
}

/** Every store of the app, on one client. */
export function createStores(client: SqlClient): Stores {
  return {
    involvement: createInvolvementStore(client),
    signature: createSignatureStore(client),
    commitFact: createCommitFactStore(client),
    reviewFact: createReviewFactStore(client),
    outcome: createOutcomeStore(client),
    issueClass: createIssueClassStore(client),
    epoch: createEpochStore(client),
    cohortStat: createCohortStatStore(client),
    recommendation: createRecommendationStore(client),
    decision: createDecisionStore(client),
    calibration: createCalibrationStore(client),
    trial: createTrialStore(client),
    graphCursor: createGraphCursorStore(client),
    settings: createSettingsStore(client),
    coverage: createCoverageStore(client),
  };
}
