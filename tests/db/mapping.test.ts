/**
 * Round trips of the mapping layer (SPEC §17, SPEC §18, DP-01, DP-13).
 *
 * The property under test is the one the contract states: an object written
 * then read back is the same object — booleans as 0/1, dates verbatim,
 * `null` and empty lists preserved, JSON payloads stable.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { describe, expect, it } from 'vitest';
import {
  decodeCohortKey,
  decodeEvidence,
  EMPTY_COHORT_KEY,
  encodeCohortKey,
  encodeEvidence,
  encodeJson,
  fromFlag,
  toFlag,
} from '../../src/db/mapping.js';
import { takenOf, toDecision, toDecisionRow, toRecommendationCard, toRecommendationRow, toTrial, toTrialAssignment, toTrialAssignmentRow, toTrialRow } from '../../src/db/mapping-advice.js';
import { toCoverage, toCoverageRow, toGraphCursor, toGraphCursorRow, toProjectSettings, toSettingsRow } from '../../src/db/mapping-collection.js';
import { toInvolvement, toInvolvementRow, toSeenSignature, toSignaturePattern, toSignaturePatternRow } from '../../src/db/mapping-involvement.js';
import { toCommitFact, toCommitFactRow, toOutcome, toOutcomeRow, toReviewFact, toReviewFactRow } from '../../src/db/mapping-outcome.js';
import { toCalibration, toCalibrationRow, toCohortStat, toCohortStatRow, toEpoch, toEpochRow, toIssueClass, toIssueClassRow } from '../../src/db/mapping-stats.js';
import type { CohortStat } from '../../src/types-advice.js';
import {
  AT,
  COHORT,
  sampleCalibration,
  sampleCard,
  sampleCommitFact,
  sampleCohortStat,
  sampleCoverage,
  sampleCursor,
  sampleDecision,
  sampleEpoch,
  sampleInvolvement,
  sampleIssueClass,
  sampleOutcome,
  samplePattern,
  sampleReviewFact,
  sampleSettings,
  sampleTrial,
  sampleAssignment,
} from './fixtures.js';

describe('shared codecs', () => {
  it('stores a boolean as 0/1 and reads it back', () => {
    expect(toFlag(true)).toBe(1);
    expect(toFlag(false)).toBe(0);
    expect(fromFlag(1)).toBe(true);
    expect(fromFlag(0)).toBe(false);
    expect(fromFlag(null)).toBe(false);
    expect(fromFlag(undefined)).toBe(false);
  });

  it('serializes evidence as stable JSON, keys sorted', () => {
    expect(encodeEvidence(['ac-2', 'ac-1'])).toBe('["ac-2","ac-1"]');
    expect(encodeJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(encodeEvidence([])).toBe('[]');
  });

  it('reads absent or malformed evidence as an empty list, never an error', () => {
    expect(decodeEvidence('')).toEqual([]);
    expect(decodeEvidence('not json')).toEqual([]);
    expect(decodeEvidence('{"a":1}')).toEqual([]);
    expect(decodeEvidence('[1,"ac-1",null]')).toEqual(['ac-1']);
  });

  it('keeps a cohort key through its serialized form, nulls included', () => {
    expect(decodeCohortKey(encodeCohortKey(COHORT))).toEqual(COHORT);
    const wide = { level: 'nature', nature: 'bug', zone: null, size: null } as const;
    expect(decodeCohortKey(encodeCohortKey(wide))).toEqual(wide);
  });

  it('falls back to an empty cohort when the stored key is unusable', () => {
    expect(decodeCohortKey('')).toEqual(EMPTY_COHORT_KEY);
    expect(decodeCohortKey('[]')).toEqual(EMPTY_COHORT_KEY);
    expect(decodeCohortKey('broken')).toEqual(EMPTY_COHORT_KEY);
  });
});

describe('involvement family', () => {
  it('loses nothing on the way to the row and back', () => {
    const involvement = sampleInvolvement();
    expect(toInvolvement(toInvolvementRow(involvement))).toEqual(involvement);
  });

  it('keeps an empty evidence list empty', () => {
    const involvement = { ...sampleInvolvement(), evidence: [] };
    const row = toInvolvementRow(involvement);
    expect(row.evidence_json).toBe('[]');
    expect(toInvolvement(row).evidence).toEqual([]);
  });

  it('loses nothing on a signature pattern', () => {
    for (const enabled of [true, false]) {
      const pattern = { ...samplePattern(), enabled };
      expect(toSignaturePattern(toSignaturePatternRow(pattern))).toEqual(pattern);
    }
  });

  it('builds a seen mention from the catalogue row and the last commit date', () => {
    const row = toSignaturePatternRow({ ...samplePattern(), seenCount: 3 });
    expect(toSeenSignature(row, AT)).toEqual({
      patternId: 'pat-agent-a',
      agentName: 'agent-a',
      seenCount: 3,
      lastSeenAt: AT,
    });
  });
});

describe('fact family', () => {
  it('loses nothing on a commit fact, and keeps no message', () => {
    const fact = sampleCommitFact();
    const row = toCommitFactRow(fact);
    expect(Object.keys(row).sort()).toEqual([
      'agent_name',
      'author_is_bot',
      'commit_ref',
      'committed_at',
      'has_signature',
      'issue_id',
    ]);
    expect(toCommitFact(row)).toEqual(fact);
  });

  it('loses nothing on a review fact, open pull request included', () => {
    const fact = sampleReviewFact();
    expect(toReviewFact(toReviewFactRow(fact))).toEqual(fact);
    const open = { ...fact, mergedAt: '' };
    expect(toReviewFact(toReviewFactRow(open)).mergedAt).toBe('');
  });

  it('loses nothing on an outcome, every flag included', () => {
    const outcome = sampleOutcome();
    expect(toOutcome(toOutcomeRow(outcome))).toEqual(outcome);
    const hard = { ...outcome, reopened: true, takeover: true, abandoned: true, clean: false };
    expect(toOutcome(toOutcomeRow(hard))).toEqual(hard);
  });
});

describe('statistics family', () => {
  it('loses nothing on a classification', () => {
    const issueClass = sampleIssueClass();
    expect(toIssueClass(toIssueClassRow(issueClass))).toEqual(issueClass);
  });

  it('loses nothing on an epoch', () => {
    const epoch = sampleEpoch();
    expect(toEpoch(toEpochRow(epoch))).toEqual(epoch);
  });

  it('loses nothing on a cohort statistic of every depth', () => {
    const depths: CohortStat[] = [
      sampleCohortStat('agent'),
      { ...sampleCohortStat('human'), key: { level: 'nature-size', nature: 'bug', zone: null, size: 'M' } },
      { ...sampleCohortStat('agent'), key: { level: 'nature', nature: 'bug', zone: null, size: null } },
    ];
    for (const stat of depths) {
      expect(toCohortStat(toCohortStatRow(stat))).toEqual(stat);
    }
  });

  it('loses nothing on a calibration row', () => {
    const calibration = sampleCalibration();
    expect(toCalibration(toCalibrationRow(calibration))).toEqual(calibration);
  });
});

describe('advice family', () => {
  it('keeps the verdict of a card through the row', () => {
    const card = sampleCard();
    const row = toRecommendationRow(card);
    const back = toRecommendationCard(row);
    expect(back.issueId).toBe(card.issueId);
    expect(back.value).toBe(card.value);
    expect(back.cohort).toEqual(card.cohort);
    expect(back.confidence).toBe(card.confidence);
    expect(back.reasons).toEqual(card.reasons);
    expect(back.referenceIssueKeys).toEqual(card.referenceIssueKeys);
    expect(back.computedAt).toBe(card.computedAt);
  });

  it('leaves the figures of a cached card empty instead of inventing them', () => {
    const back = toRecommendationCard(toRecommendationRow(sampleCard()));
    expect(back.agent).toBeNull();
    expect(back.human).toBeNull();
    expect(back.agentLeadTime).toBeNull();
    expect(back.humanLeadTime).toBeNull();
    expect(back.conditions).toEqual([]);
    expect(back.guardrails).toEqual([]);
    expect(back.failureCauses).toEqual([]);
    expect(back.conclusion).toBe('not-enough-data');
    expect(back.demo).toBe(false);
  });

  it('keeps the decision row and derives what was taken', () => {
    const decision = sampleDecision();
    const row = toDecisionRow(decision);
    expect(row).toEqual({
      issue_id: decision.issueId,
      followed: 1,
      actual_level: 'driven',
      reason: 'criteria present',
      at: AT,
    });
    expect(toDecision(row, 'delegate')).toEqual(decision);
    expect(takenOf(row, 'delegate-with-review')).toBe('delegate');
    expect(takenOf({ ...row, followed: 0 }, 'delegate-with-review')).toBe('keep-human');
    expect(takenOf(row, 'keep-human')).toBe('keep-human');
    expect(takenOf(row, null)).toBe('delegate');
    expect(takenOf({ ...row, followed: 0 }, null)).toBe('keep-human');
  });

  it('keeps a trial assignment without loss', () => {
    const assignment = sampleAssignment();
    expect(toTrialAssignment(toTrialAssignmentRow(assignment))).toEqual(assignment);
  });

  it('keeps the period and the state of a trial', () => {
    const trial = sampleTrial();
    const back = toTrial(toTrialRow(trial));
    expect(back.id).toBe(trial.id);
    expect(back.projectId).toBe(trial.projectId);
    expect(back.cohort).toEqual(trial.cohort);
    expect(back.startsAt).toBe(trial.startsAt);
    expect(back.endsAt).toBe(trial.endsAt);
    expect(back.state).toBe(trial.state);
  });
});

describe('collection family', () => {
  it('loses nothing on a cursor', () => {
    const cursor = sampleCursor();
    expect(toGraphCursor(toGraphCursorRow(cursor))).toEqual(cursor);
  });

  it('loses nothing on the settings of a project', () => {
    const settings = sampleSettings();
    expect(toProjectSettings(toSettingsRow(settings))).toEqual(settings);
  });

  it('reads settings whose payloads are absent as empty declarations', () => {
    const row = toSettingsRow(sampleSettings());
    const bare = { ...row, taxonomy_json: '', hardened_review_json: '', waiting_statuses_json: '' };
    const back = toProjectSettings(bare);
    expect(back.natures).toEqual([]);
    expect(back.zones).toEqual([]);
    expect(back.sensitiveZones).toEqual([]);
    expect(back.waitingStatuses).toEqual([]);
    expect(back.hardenedReview.minReviewers).toBe(2);
  });

  it('loses nothing on the coverage of a project', () => {
    const coverage = sampleCoverage();
    expect(toCoverage(toCoverageRow(coverage))).toEqual(coverage);
  });

  it('reads absent permissions as an empty list', () => {
    const row = { ...toCoverageRow(sampleCoverage()), permissions_json: '' };
    expect(toCoverage(row).permissions).toEqual([]);
  });
});
