/**
 * Sample domain objects for the tests of this folder (SPEC §8, SPEC §18,
 * DP-11).
 *
 * One factory per object the stores carry, so a test states what it changes
 * and nothing else. Every date is ISO 8601 UTC, every identifier is a ticket
 * key or a project key (the convention of `src/db/scope.ts`).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type {
  CommitFact,
  CohortKey,
  Epoch,
  Involvement,
  IssueClass,
  Outcome,
  ReviewFact,
  SignaturePattern,
} from '../../src/types.js';
import type {
  Calibration,
  CohortStat,
  Coverage,
  Decision,
  ProjectSettings,
  RecommendationCard,
  Trial,
  TrialAssignment,
} from '../../src/types-advice.js';
import type { GraphCursor } from '../../src/types-graph.js';

export const PROJECT = 'PROJ';
export const ISSUE = 'PROJ-1';
export const EPOCH_ID = 'ep-2026-09';
export const AT = '2026-11-01T09:00:00.000Z';

export const COHORT: CohortKey = {
  level: 'nature-zone-size',
  nature: 'migration',
  zone: 'billing',
  size: 'M',
};

export function sampleInvolvement(issueId = ISSUE): Involvement {
  return {
    issueId,
    level: 'driven',
    source: 'mcp-declaration',
    client: 'forge-cli',
    model: 'model-a',
    sessionRef: 'session-1',
    evidence: ['ac-1', 'ac-2'],
    decidedAt: AT,
  };
}

export function samplePattern(id = 'pat-agent-a'): SignaturePattern {
  return {
    id,
    expression: 'Co-authored-by: Agent A',
    agentName: 'agent-a',
    enabled: true,
    seenCount: 0,
  };
}

export function sampleCommitFact(issueId = ISSUE, commitRef = 'sha-1'): CommitFact {
  return {
    issueId,
    commitRef,
    hasSignature: true,
    agentName: 'agent-a',
    authorIsBot: true,
    committedAt: AT,
  };
}

export function sampleReviewFact(issueId = ISSUE, prRef = 'pr-1'): ReviewFact {
  return {
    issueId,
    prRef,
    reviewerCount: 2,
    changesRequested: 1,
    commentCount: 4,
    commitsAfterOpen: 2,
    openedAt: AT,
    mergedAt: '2026-11-02T09:00:00.000Z',
  };
}

export function sampleOutcome(issueId = ISSUE): Outcome {
  return {
    issueId,
    closedAt: '2026-11-02T09:00:00.000Z',
    leadTimeH: 26.5,
    reopened: false,
    causedBugs: 0,
    neighborBugs: 1,
    incidents: 0,
    takeover: false,
    abandoned: false,
    clean: true,
    matureAt: '2027-01-01T09:00:00.000Z',
  };
}

export function sampleIssueClass(issueId = ISSUE): IssueClass {
  return {
    issueId,
    nature: 'migration',
    zone: 'billing',
    size: 'M',
    classifiedBy: 'model',
    contentHash: 'hash-1',
    sizeEstimated: false,
  };
}

export function sampleEpoch(id = EPOCH_ID): Epoch {
  return {
    id,
    projectId: PROJECT,
    startsAt: '2026-09-14T00:00:00.000Z',
    label: 'new model, 14 September',
    client: 'forge-cli',
    model: 'model-a',
    instructionsVersion: 'v3',
  };
}

export function sampleCohortStat(arm: 'agent' | 'human', n = 26): CohortStat {
  return {
    projectId: PROJECT,
    epochId: EPOCH_ID,
    key: COHORT,
    arm,
    clean: { n, rate: arm === 'agent' ? 0.69 : 0.87, ciLow: 0.5, ciHigh: 0.95 },
    medianLeadH: arm === 'agent' ? 36 : 72,
    reviewLoad: arm === 'agent' ? 1.4 : 0.9,
    peopleCount: 4,
    conclusion: 'same',
    computedAt: AT,
  };
}

export function sampleCalibration(): Calibration {
  return {
    projectId: PROJECT,
    epochId: EPOCH_ID,
    value: 'delegate-with-review',
    clean: { n: 18, rate: 0.72, ciLow: 0.5, ciHigh: 0.88 },
  };
}

export function sampleCard(issueId = ISSUE): RecommendationCard {
  return {
    issueId,
    issueKey: issueId,
    value: 'delegate-with-review',
    cohort: COHORT,
    epochId: EPOCH_ID,
    agent: { n: 26, rate: 0.69, ciLow: 0.5, ciHigh: 0.84 },
    human: { n: 31, rate: 0.87, ciLow: 0.71, ciHigh: 0.95 },
    agentLeadTime: { n: 26, medianH: 36 },
    humanLeadTime: { n: 31, medianH: 72 },
    conclusion: 'same',
    balance: { balanced: true, signals: [] },
    confidence: 'medium',
    reasons: ['clean closure comparable', 'median delay better with an agent'],
    conditions: ['acceptance criteria present', 'migration test required'],
    guardrails: [],
    referenceIssueKeys: ['PROJ-207', 'PROJ-233'],
    failureCauses: [],
    demo: false,
    computedAt: AT,
  };
}

export function sampleDecision(issueId = ISSUE, at = AT): Decision {
  return {
    issueId,
    taken: 'delegate',
    followed: true,
    actualLevel: 'driven',
    reason: 'criteria present',
    at,
  };
}

export function sampleTrial(id = 'trial-1'): Trial {
  return {
    id,
    projectId: PROJECT,
    cohort: COHORT,
    epochId: EPOCH_ID,
    seed: 'seed-1',
    startsAt: '2026-11-01T00:00:00.000Z',
    endsAt: '2026-12-01T00:00:00.000Z',
    state: 'running',
    stopReason: '',
  };
}

export function sampleAssignment(issueId = ISSUE): TrialAssignment {
  return { trialId: 'trial-1', issueId, arm: 'agent', complied: true, excludedReason: '' };
}

export function sampleCursor(objectType: GraphCursor['objectType'] = 'commit'): GraphCursor {
  return { projectId: PROJECT, objectType, lastIssueId: ISSUE, lastRunAt: AT };
}

export function sampleSettings(projectId = PROJECT): ProjectSettings {
  return {
    projectId,
    projectKey: projectId,
    minArmSize: 20,
    adoptionDate: '2026-01-15',
    natures: ['migration', 'bug', 'feature'],
    zones: ['billing', 'api'],
    sizes: ['S', 'M', 'L'],
    sensitiveZones: ['billing'],
    hardenedReview: {
      label: 'two reviewers, one zone owner',
      minReviewers: 2,
      zoneOwnerRequired: true,
      evidencePerCriterion: false,
    },
    waitingStatuses: ['Blocked', 'Waiting for review'],
    demo: false,
    updatedAt: AT,
  };
}

export function sampleCoverage(projectId = PROJECT): Coverage {
  return {
    projectId,
    knownIssues: 42,
    totalIssues: 60,
    permissions: [
      { objectType: 'commit', state: 'granted', testedAt: AT },
      { objectType: 'pull-request', state: 'missing', testedAt: AT },
    ],
    lastCollectionAt: AT,
    lastCollectionOk: true,
    demo: false,
  };
}
