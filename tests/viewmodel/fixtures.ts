/**
 * Hand-built domain fixtures for the viewmodel tests (SPEC §16, §22; DP-11,
 * DP-14, DP-17, DP-20, DP-24, recipes 10 and 11).
 *
 * Every figure here is invented on purpose: the viewmodels are projections, so
 * the tests check that a known domain input produces a known screen output, and
 * that the honest-statistics rules hold (a rate never appears without its
 * sample size and its interval, a masked cohort shows no figure).
 */
import type {
  Balance,
  CohortKey,
  DurationStat,
  Involvement,
  ProportionStat,
  SignaturePattern,
  Epoch,
} from '../../src/types.js';
import type {
  Calibration,
  Coverage,
  Decision,
  DelegationMap,
  DelegationMapCell,
  HardenedReview,
  ProjectSettings,
  RecommendationCard,
} from '../../src/types-advice.js';
import type {
  CohortEpoch,
  CohortEpochArm,
  DelegableWorkItem,
  GetCohortOutput,
} from '../../src/types-mcp.js';
import type { GraphPermission } from '../../src/types.js';

/** A proportion with a controlled sample size and interval (SPEC §7 rule 3). */
export function ps(n: number, rate: number, ciLow: number, ciHigh: number): ProportionStat {
  return { n, rate, ciLow, ciHigh };
}

/** The SPEC §8 reference figure: 83 % on 41 → [69 % ; 91 %]. */
export const AGENT_CLEAN: ProportionStat = ps(41, 0.83, 0.69, 0.91);
/** The SPEC §8 reference figure: 69 % on 26 → [50 % ; 84 %]. */
export const HUMAN_CLEAN: ProportionStat = ps(26, 0.69, 0.50, 0.84);

/** A duration with its sample size. */
export function dur(n: number, medianH: number): DurationStat {
  return { n, medianH };
}

/** A narrow cohort key: nature × zone × size. */
export const COHORT_NARROW: CohortKey = {
  level: 'nature-zone-size',
  nature: 'bugfix',
  zone: 'billing',
  size: 'M',
};

/** A widened cohort key: the app went up to nature × size (SPEC §7 rule 1). */
export const COHORT_WIDE: CohortKey = {
  level: 'nature-size',
  nature: 'bugfix',
  zone: null,
  size: 'M',
};

/** A balanced comparison. */
export const BALANCED: Balance = { balanced: true, signals: [] };

/** An unbalanced comparison, with one signal. */
export const UNBALANCED: Balance = {
  balanced: false,
  signals: [{ criterion: 'size-mix', agentShare: 0.6, humanShare: 0.3, difference: 0.3 }],
};

/** A complete recommendation card (SPEC §8, DP-11). */
export function card(over: Partial<RecommendationCard> = {}): RecommendationCard {
  return {
    issueId: 'i1',
    issueKey: 'PROJ-412',
    value: 'delegate',
    cohort: COHORT_NARROW,
    epochId: 'e3',
    agent: AGENT_CLEAN,
    human: HUMAN_CLEAN,
    agentLeadTime: dur(41, 5),
    humanLeadTime: dur(26, 9),
    conclusion: 'better',
    balance: BALANCED,
    confidence: 'high',
    reasons: ['cleaner closure with an agent'],
    conditions: [],
    guardrails: [],
    referenceIssueKeys: ['PROJ-100', 'PROJ-101'],
    failureCauses: [],
    demo: false,
    computedAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

/** A decision that followed the advice (DP-13). */
export function decision(over: Partial<Decision> = {}): Decision {
  return {
    issueId: 'i1',
    taken: 'delegate',
    followed: true,
    actualLevel: 'driven',
    reason: 'safe bugfix',
    at: '2026-09-02T00:00:00Z',
    ...over,
  };
}

/** An involvement with its source (DP-01). */
export function involvement(over: Partial<Involvement> = {}): Involvement {
  return {
    issueId: 'i1',
    level: 'driven',
    source: 'mcp-declaration',
    client: 'agent-x',
    model: 'm',
    sessionRef: 's1',
    evidence: [],
    decidedAt: '2026-09-02T00:00:00Z',
    ...over,
  };
}

/** One matrix cell. */
export function cell(over: Partial<DelegationMapCell> = {}): DelegationMapCell {
  return {
    nature: 'bugfix',
    zone: 'billing',
    color: 'green',
    recommendation: 'delegate',
    cohort: COHORT_NARROW,
    agentN: 41,
    humanN: 26,
    masked: false,
    failureCauses: [],
    ...over,
  };
}

/** A delegation map with one green cell and one masked cell (DP-14, DP-24). */
export function delegationMap(over: Partial<DelegationMap> = {}): DelegationMap {
  const cells: DelegationMapCell[] = [
    cell(),
    cell({ nature: 'refactor', zone: 'api', color: 'red', recommendation: 'keep-human', masked: true, agentN: 2, humanN: 1, failureCauses: ['reopening'] }),
  ];
  return {
    projectId: 'p1',
    epochId: 'e3',
    epochs: [{ id: 'e3', projectId: 'p1', startsAt: '2026-09-01T00:00:00Z', label: 'new model, 1 September', client: 'c', model: 'm', instructionsVersion: 'v1' }],
    natures: ['bugfix', 'refactor'],
    zones: ['billing', 'api'],
    cells,
    greyShare: 0.25,
    delegableShare: 0.38,
    sprintId: '42',
    deviations: [{ cohort: COHORT_NARROW, direction: 'delegated-against', count: 3, cleanRate: 0.5 }],
    demo: false,
    computedAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

/** One cohort epoch arm. */
export function epochArm(arm: 'agent' | 'human', clean: ProportionStat, over: Partial<CohortEpochArm> = {}): CohortEpochArm {
  return { epochId: 'e3', epochLabel: 'new model', arm, clean, leadTime: dur(clean.n, 6), reviewLoad: 4, ...over };
}

/** A cohort detail with two arms (SPEC §16.3). */
export function cohortOutput(over: Partial<GetCohortOutput> = {}): GetCohortOutput {
  const epochs: CohortEpoch[] = [{
    epochId: 'e3',
    epochLabel: 'new model',
    arms: [epochArm('agent', AGENT_CLEAN), epochArm('human', HUMAN_CLEAN)],
    conclusion: 'better',
    balance: BALANCED,
    outdated: false,
  }];
  return { cohort: COHORT_NARROW, epochs, masked: false, peopleCount: 8, demo: false, ...over };
}

/** A coverage with all rights granted (SPEC §16.6). */
export function coverage(over: Partial<Coverage> = {}): Coverage {
  const permissions: GraphPermission[] = [
    { objectType: 'commit', state: 'granted', testedAt: '2026-09-01T00:00:00Z' },
    { objectType: 'pull-request', state: 'granted', testedAt: '2026-09-01T00:00:00Z' },
    { objectType: 'issue', state: 'granted', testedAt: '2026-09-01T00:00:00Z' },
    { objectType: 'user', state: 'granted', testedAt: '2026-09-01T00:00:00Z' },
  ];
  return {
    projectId: 'p1',
    knownIssues: 80,
    totalIssues: 100,
    permissions,
    lastCollectionAt: '2026-09-01T00:00:00Z',
    lastCollectionOk: true,
    demo: false,
    ...over,
  };
}

/** A calibration row. */
export function calibrationRow(value: Calibration['value'], n: number, rate: number, ciLow: number, ciHigh: number): Calibration {
  return { projectId: 'p1', epochId: 'e3', value, clean: ps(n, rate, ciLow, ciHigh) };
}

/** A hardened-review definition (SPEC §8). */
export function hardenedReview(over: Partial<HardenedReview> = {}): HardenedReview {
  return { label: 'two reviewers and zone owner', minReviewers: 2, zoneOwnerRequired: true, evidencePerCriterion: false, ...over };
}

/** Project settings (SPEC §16.5). */
export function settings(over: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    projectId: 'p1',
    projectKey: 'PROJ',
    minArmSize: 20,
    adoptionDate: '2026-01-15',
    natures: ['bugfix', 'refactor'],
    zones: ['billing', 'api'],
    sizes: ['S', 'M', 'L'],
    sensitiveZones: ['api'],
    hardenedReview: hardenedReview(),
    waitingStatuses: ['Blocked'],
    demo: false,
    updatedAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

/** A commit-mention pattern, seen twice (DP-02). */
export function pattern(over: Partial<SignaturePattern> = {}): SignaturePattern {
  return { id: 'pat1', expression: 'Co-authored-by: Agent', agentName: 'Agent', enabled: true, seenCount: 2, ...over };
}

/** An epoch. */
export function epoch(over: Partial<Epoch> = {}): Epoch {
  return { id: 'e3', projectId: 'p1', startsAt: '2026-09-01T00:00:00Z', label: 'new model', client: 'c', model: 'm', instructionsVersion: 'v1', ...over };
}

/** A delegable work item (recipe 13). */
export function workItem(over: Partial<DelegableWorkItem> = {}): DelegableWorkItem {
  return { issueKey: 'PROJ-1', confidence: 'high', reasons: ['safe bugfix'], ...over };
}
