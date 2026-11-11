/**
 * Tests of the cohorts — DP-07, DP-03, DP-26, SPEC §7 rule 1, §21.
 *
 * One test per behaviour: the announced fallback, the two arms and the unknown
 * tickets left out, the cohort without a human arm, the team of three, the
 * ticket moved to another project, the failure causes.
 */
import { describe, expect, it } from 'vitest';
import type { FailureCause, LlmGateway, NatureClassification } from '../../src/ports.js';
import type { CohortKey, IssueClass, Level, Nature } from '../../src/types.js';
import { NATURE_NO_CODE } from '../../src/types.js';
import {
  armOf,
  buildArms,
  cohortKeyOf,
  cohortKeyString,
  cohortsOfOneEpoch,
  groupByCohort,
  insightForArms,
  isInCohort,
  moveTicketToProject,
  parseCohortKey,
  resolveCohortScope,
  resolutionMessage,
  summarizeFailureCauses,
  unknownShareMessage,
  widen,
  type CohortTicket,
} from '../../src/domain/cohort.js';

function issueClass(overrides: Partial<IssueClass> = {}): IssueClass {
  return {
    issueId: 'issue-1',
    nature: 'bugfix',
    zone: 'front',
    size: 'M',
    classifiedBy: 'rules',
    contentHash: 'fnv1a-00000001',
    sizeEstimated: false,
    ...overrides,
  };
}

function cohortTicket(issueId: string, level: Level, overrides: Partial<IssueClass> = {}, projectId = 'project-1'): CohortTicket {
  return { issueId, projectId, level, issueClass: issueClass({ issueId, ...overrides }) };
}

class CountingLlm implements LlmGateway {
  calls = 0;

  constructor(private readonly causes: readonly FailureCause[] = []) {}

  async classifyNature(_text: string, _natures: readonly Nature[]): Promise<NatureClassification> {
    this.calls += 1;
    return { nature: 'bugfix', rationale: 'r' };
  }

  async summarizeFailureCauses(comments: readonly string[], limit: number): Promise<FailureCause[]> {
    this.calls += 1;
    return this.causes.slice(0, Math.min(limit, comments.length === 0 ? 0 : this.causes.length));
  }
}

describe('cohort — keys', () => {
  it('keys a cohort by nature, zone and size', () => {
    const key = cohortKeyOf(issueClass({ nature: 'data-migration', zone: 'back', size: 'L' }), 'nature-zone-size');
    expect(key).toEqual({ level: 'nature-zone-size', nature: 'data-migration', zone: 'back', size: 'L' });
    expect(cohortKeyOf(issueClass(), 'nature')).toEqual({ level: 'nature', nature: 'bugfix', zone: null, size: null });
  });

  it('drops the zone, then the size, when it widens the cohort', () => {
    const precise: CohortKey = { level: 'nature-zone-size', nature: 'bugfix', zone: 'front', size: 'M' };
    expect(widen(precise)).toEqual({ level: 'nature-size', nature: 'bugfix', zone: null, size: 'M' });
    expect(widen({ level: 'nature-size', nature: 'bugfix', zone: null, size: 'M' })).toEqual({
      level: 'nature',
      nature: 'bugfix',
      zone: null,
      size: null,
    });
    expect(widen({ level: 'nature', nature: 'bugfix', zone: null, size: null })).toBeNull();
  });

  it('writes a cohort key and reads it back, a missing field as a dash', () => {
    const keys: CohortKey[] = [
      { level: 'nature-zone-size', nature: 'bugfix', zone: 'front', size: 'M' },
      { level: 'nature-size', nature: 'tests', zone: null, size: 'S' },
      { level: 'nature', nature: 'refactor', zone: null, size: null },
      { level: 'nature-zone-size', nature: 'a|b', zone: 'x\\y', size: 'M' },
    ];
    for (const key of keys) {
      expect(parseCohortKey(cohortKeyString(key))).toEqual(key);
    }
    expect(cohortKeyString(keys[2])).toBe('nature|refactor|-|-');
    expect(parseCohortKey('not|a|key')).toBeNull();
    expect(parseCohortKey('project|bugfix|-|-')).toBeNull();
  });

  it('keeps the work without commit out of the code cohorts', () => {
    const codeCohort: CohortKey = { level: 'nature', nature: 'bugfix', zone: null, size: null };
    expect(isInCohort(codeCohort, issueClass({ nature: NATURE_NO_CODE }))).toBe(false);
    expect(isInCohort(codeCohort, issueClass({ nature: 'bugfix' }))).toBe(true);
  });
});

describe('cohort — arms', () => {
  it('leaves the tickets of unknown involvement out of both arms', () => {
    const arms = buildArms([
      cohortTicket('a', 'autonomous'),
      cohortTicket('b', 'none'),
      cohortTicket('c', 'unknown'),
      cohortTicket('d', 'unknown'),
    ]);
    expect(arms.agent.map((t) => t.issueId)).toEqual(['a']);
    expect(arms.human.map((t) => t.issueId)).toEqual(['b']);
    expect(arms.unknown.map((t) => t.issueId)).toEqual(['c', 'd']);
    expect(armOf('unknown')).toBeNull();
    expect(armOf('assisted')).toBe('agent');
    expect(armOf('none')).toBe('human');
  });

  it('renders the share of the tickets whose involvement is unknown', () => {
    const tickets = [cohortTicket('a', 'driven'), cohortTicket('b', 'unknown')];
    const arms = buildArms([...tickets, ...Array.from({ length: 8 }, (_, i) => cohortTicket(`u${i}`, 'unknown'))]);
    expect(arms.unknownShare).toBeCloseTo(0.9, 5);
    expect(unknownShareMessage(buildArms([
      cohortTicket('a', 'driven'),
      cohortTicket('b', 'none'),
      cohortTicket('c', 'unknown'),
      cohortTicket('d', 'unknown'),
      cohortTicket('e', 'unknown'),
    ]))).toContain('60 %');
  });

  it('says that a cohort without a human arm cannot be compared, and proposes a trial', () => {
    const arms = buildArms([cohortTicket('a', 'autonomous'), cohortTicket('b', 'driven')]);
    const insight = insightForArms(arms);
    expect(insight.kind).toBe('no-human-arm');
    expect(insight.compareWithPreviousEpoch).toBe(true);
    expect(insight.suggestControlledTrial).toBe(true);
    expect(insight.message).toContain('le bras humain est vide');
    expect(insightForArms(buildArms([cohortTicket('a', 'autonomous'), cohortTicket('b', 'none')])).kind).toBe('complete');
  });
});

describe('cohort — fallback', () => {
  const front = [cohortTicket('a', 'autonomous'), cohortTicket('b', 'none')];
  const back = Array.from({ length: 4 }, (_, i) => cohortTicket(`c${i}`, 'driven', { zone: 'back' }));

  it('goes one level up and says it when the cohort is too small', () => {
    const key = cohortKeyOf(front[0].issueClass, 'nature-zone-size');
    const resolution = resolveCohortScope(key, [...front, ...back], 5);
    expect(resolution.fellBack).toBe(true);
    expect(resolution.level).toBe('nature-size');
    expect(resolution.sampleSize).toBe(6);
    expect(resolutionMessage(resolution)).toContain("l'app remonte d'un niveau");
  });

  it('stays at the most precise level when the cohort is big enough', () => {
    const key = cohortKeyOf(front[0].issueClass, 'nature-zone-size');
    const resolution = resolveCohortScope(key, front, 2);
    expect(resolution.fellBack).toBe(false);
    expect(resolution.level).toBe('nature-zone-size');
    expect(resolution.key).toEqual(key);
  });

  it('renders the whole project when even the nature is too narrow', () => {
    const scattered = [
      cohortTicket('a', 'none', { nature: 'bugfix' }),
      cohortTicket('b', 'none', { nature: 'tests' }),
      cohortTicket('c', 'driven', { nature: 'refactor' }),
    ];
    const resolution = resolveCohortScope(cohortKeyOf(scattered[0].issueClass, 'nature-zone-size'), scattered, 5);
    expect(resolution.scope).toBe('project');
    expect(resolution.key).toBeNull();
    expect(resolution.fellBack).toBe(true);
    expect(resolution.reason).toContain('projet');
  });

  it('renders the project level for a team of three, with the reason', () => {
    const key = cohortKeyOf(front[0].issueClass, 'nature-zone-size');
    const resolution = resolveCohortScope(key, [...front, ...back], 2, 3);
    expect(resolution.scope).toBe('project');
    expect(resolution.fellBack).toBe(true);
    expect(resolution.reason).toContain('équipe de 3 personnes');
  });
});

describe('cohort — grouping and moves', () => {
  it('groups the tickets of one epoch by cohort, without the work without commit', () => {
    const groups = groupByCohort(
      [
        cohortTicket('a', 'autonomous'),
        cohortTicket('b', 'none'),
        cohortTicket('c', 'driven', { zone: 'back' }),
        cohortTicket('d', 'none', { nature: NATURE_NO_CODE }),
      ],
      'nature-size',
    );
    expect(groups.map((group) => cohortKeyString(group.key))).toEqual(['nature-size|bugfix|-|M']);
    expect(groups[0].tickets.map((t) => t.issueId)).toEqual(['a', 'b', 'c']);
  });

  it('carries one epoch at a time, so two epochs never mix in one cohort', () => {
    const first = cohortsOfOneEpoch('epoch-1', [cohortTicket('a', 'autonomous'), cohortTicket('b', 'none')], 'nature-size');
    const second = cohortsOfOneEpoch('epoch-2', [cohortTicket('c', 'driven')], 'nature-size');
    expect(first.epochId).toBe('epoch-1');
    expect(second.epochId).toBe('epoch-2');
    expect(first.groups[0].tickets.map((t) => t.issueId)).toEqual(['a', 'b']);
    expect(second.groups[0].tickets.map((t) => t.issueId)).toEqual(['c']);
    expect(cohortsOfOneEpoch(null, [], 'nature').groups).toEqual([]);
  });

  it('keeps the involvement and the class of a ticket moved to another project', () => {
    const moved = moveTicketToProject(cohortTicket('a', 'autonomous', { nature: 'data-migration' }), 'project-2');
    expect(moved.projectId).toBe('project-2');
    expect(moved.level).toBe('autonomous');
    expect(moved.issueClass.nature).toBe('data-migration');
    expect(moved.issueId).toBe('a');
    const oldCohort = buildArms([cohortTicket('a', 'autonomous')]);
    const newCohort = buildArms([moved]);
    expect(oldCohort.total).toBe(1);
    expect(newCohort.agent[0].projectId).toBe('project-2');
  });
});

describe('cohort — failure causes', () => {
  it('summarizes the most frequent causes of failure of the cohort', async () => {
    const llm = new CountingLlm([
      { cause: 'tests absents', count: 4 },
      { cause: 'critères flous', count: 2 },
      { cause: 'zone sans conventions écrites', count: 1 },
    ]);
    const summary = await summarizeFailureCauses(['pas de test', 'critères vagues', 'rien'], llm, 5);
    expect(summary.causes.map((cause) => cause.cause)).toContain('tests absents');
    expect(summary.total).toBe(7);
    expect(summary.foldable).toBe(true);
    expect(summary.message).toContain('rouge');
    expect(llm.calls).toBe(1);
  });

  it('never calls the model when there is no reopening comment', async () => {
    const llm = new CountingLlm([{ cause: 'tests absents', count: 1 }]);
    const summary = await summarizeFailureCauses([], llm, 5);
    expect(summary.causes).toEqual([]);
    expect(summary.truncated).toBe(false);
    expect(llm.calls).toBe(0);
  });

  it('bounds the rendered causes', async () => {
    const llm = new CountingLlm([
      { cause: 'tests absents', count: 4 },
      { cause: 'critères flous', count: 2 },
      { cause: 'zone sans conventions écrites', count: 1 },
    ]);
    const summary = await summarizeFailureCauses(['a', 'b', 'c'], llm, 2);
    expect(summary.causes.length).toBe(2);
    expect(summary.truncated).toBe(true);
  });
});
