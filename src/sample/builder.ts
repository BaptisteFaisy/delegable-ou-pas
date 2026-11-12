/**
 * SPEC §13, §24 · DP-20 — the demo dataset builder.
 *
 * The builder turns the catalogue of families into the facts the app stores:
 * tickets, status histories, commits, pull requests, outcomes, involvements and
 * classifications. It is plain data: no `@forge/*`, no database, no clock of
 * its own (the reference date is fixed in `project.ts`). The demo mode plugs
 * this builder in front of the domain instead of the Forge bridges (lot L7).
 *
 * The families are the single source of the figures: the documents of the demo
 * never write a number by hand, the tests compare them with what the builder
 * produces (SPEC §24.1, DP-20).
 */
import type { Level, Nature, Size, Source, Zone } from '../types.js';
import type { ArmPlan, FamilyPlan, OpenTicketSpec, Seed, SeedArm, SeedFailure } from './issues.js';
import { AGENT_LEVELS, AGENT_SOURCES, FAMILIES, SAMPLE_PINS, issueTypeOf } from './issues.js';
import {
  addHours,
  issueIdOfKey,
  leadTimes,
  makeIds,
  sprintOf,
  spreadDates,
  storyPointsOf,
} from './project.js';

/** A clean closure: nothing went wrong (SPEC §6). */
const CLEAN: SeedFailure = { reopened: false, causedBugs: 0, incidents: 0, takeover: false, abandoned: false };

/** The hours between the creation of a ticket and the start of its work. */
const QUEUE_H = 36;

/**
 * The failures of one arm, in the order the generator hands them out (SPEC §6).
 *
 * `incidents` and `takeover` are modifiers: an incident rides on a failure that
 * already caused a bug, a takeover rides on the last one. The number of
 * failures is `count - clean`, and the generator checks it.
 */
function failureList(plan: ArmPlan['failures']): readonly SeedFailure[] {
  const reopened = plan.reopened ?? 0;
  const causedBugs = plan.causedBugs ?? 0;
  const incidents = plan.incidents ?? 0;
  const abandoned = plan.abandoned ?? 0;
  const failures: SeedFailure[] = [];
  for (let index = 0; index < reopened; index += 1) failures.push({ ...CLEAN, reopened: true });
  for (let index = 0; index < causedBugs; index += 1) failures.push({ ...CLEAN, causedBugs: 1 });
  for (let index = 0; index < abandoned; index += 1) failures.push({ ...CLEAN, abandoned: true });
  const firstIncident = reopened + Math.max(0, causedBugs - incidents);
  for (let index = firstIncident; index < reopened + causedBugs; index += 1) {
    failures[index] = { ...failures[index], incidents: 1 };
  }
  const last = reopened + causedBugs - 1;
  if (last >= reopened && (plan.takeover ?? 0) > 0) {
    failures[last] = { ...failures[last], takeover: true };
  }
  return failures;
}

/** The level of one ticket of an arm (SPEC §5 "Les cinq niveaux"). */
function levelOf(arm: SeedArm, source: Source, position: number): Level {
  if (arm === 'human') return 'none';
  if (arm === 'unknown') return 'unknown';
  if (source === 'commit-mention' || source === 'bot-author') return 'driven';
  return AGENT_LEVELS[position % AGENT_LEVELS.length];
}

/** The source of one ticket of an arm (SPEC §5 "Cinq sources"). */
function sourceOf(arm: SeedArm, plan: ArmPlan, position: number): Source {
  if (arm === 'human') return plan.source ?? 'closure-field';
  if (arm === 'unknown') return 'adoption-date';
  return AGENT_SOURCES[position % AGENT_SOURCES.length];
}

/** The key of one ticket: the pinned one when there is one (SPEC §24.1). */
function keyOf(family: FamilyPlan, arm: SeedArm, position: number, ids: { ticket(): string }): string {
  const pinned = SAMPLE_PINS.find(
    (pin) => pin.familyId === family.id && pin.arm === arm && pin.position === position,
  );
  return pinned ? pinned.key : ids.ticket();
}

/** The number of commits of one ticket: no code, no commit (SPEC §21). */
function commitsOf(nature: string, position: number): number {
  if (nature === 'no-code') return 0;
  return 1 + (position % 3);
}

/** Everything a seed needs, before it is built. */
interface SeedInput {
  readonly family: FamilyPlan;
  readonly arm: SeedArm;
  readonly position: number;
  readonly key: string;
  readonly createdAt: string;
  readonly closedAt: string;
  readonly leadTimeH: number;
  readonly failure: SeedFailure;
  readonly level: Level;
  readonly source: Source;
  readonly commits: number;
  /** Overrides for the open tickets the demo declares by hand (SPEC §8). */
  readonly nature?: Nature;
  readonly zone?: Zone;
  readonly size?: Size;
  readonly summary?: string;
  readonly hasDescription?: boolean;
}

/** One seed of the demo dataset (SPEC §24.1). */
function seedOf(input: SeedInput): Seed {
  const closed = input.closedAt !== '';
  const status = input.failure.abandoned ? 'Abandonné' : 'Terminé';
  const nature = input.nature ?? input.family.nature;
  const zone = input.zone ?? input.family.zone;
  const size = input.size ?? input.family.size;
  return {
    id: issueIdOfKey(input.key),
    key: input.key,
    family: input.family.id,
    epochId: input.family.epochId,
    nature,
    zone,
    size,
    arm: input.arm,
    level: input.level,
    source: input.source,
    createdAt: input.createdAt,
    updatedAt: closed ? input.closedAt : addHours(input.createdAt, 12),
    closedAt: input.closedAt,
    closedStatus: closed ? status : '',
    status: closed ? status : 'En cours',
    leadTimeH: closed ? input.leadTimeH : 0,
    failure: input.failure,
    neighborBugs: input.position % 13 === 5 ? 1 : 0,
    reopenedAt: input.failure.reopened && closed ? addHours(input.closedAt, -24) : '',
    reopenDurationMin: input.failure.reopened ? 120 : 0,
    sprintId: sprintOf(input.createdAt),
    storyPoints: storyPointsOf(size),
    issueType: input.family.issueType ?? issueTypeOf(nature),
    summary: input.summary ?? input.family.summary,
    hasDescription: input.hasDescription ?? (input.family.description ?? 'full') === 'full',
    component: zone,
    labels: ['demo', nature, ...(input.family.labels ?? [])],
    classifiedBy: input.family.classifiedBy ?? 'rules',
    sizeEstimated: input.family.sizeEstimated ?? false,
    commits: input.commits,
    heavyReview: input.family.heavyReview ?? false,
    position: input.position,
  };
}

/** The seeds of one arm of one family. */
function armSeeds(
  family: FamilyPlan,
  arm: SeedArm,
  plan: ArmPlan,
  dates: readonly string[],
  ids: { ticket(): string },
): readonly Seed[] {
  if (plan.count <= 0) return [];
  const failures = failureList(plan.failures);
  const leads = leadTimes(plan.count, plan.medianH);
  return Array.from({ length: plan.count }, (_unused, position) => {
    const closedAt = dates[position] ?? `${family.to}T12:00:00Z`;
    const failure = position < plan.clean ? CLEAN : failures[position - plan.clean] ?? CLEAN;
    const source = sourceOf(arm, plan, position);
    return seedOf({
      family,
      arm,
      position,
      key: keyOf(family, arm, position, ids),
      createdAt: addHours(closedAt, -leads[position] - QUEUE_H),
      closedAt,
      leadTimeH: leads[position],
      failure,
      level: levelOf(arm, source, position),
      source,
      commits: commitsOf(family.nature, position),
    });
  });
}

/** The seeds of the tickets whose involvement could not be read (DP-03). */
function unknownSeeds(family: FamilyPlan, ids: { ticket(): string }): readonly Seed[] {
  if (family.unknown <= 0) return [];
  const dates = spreadDates(family.from, family.to, family.unknown);
  const leads = leadTimes(family.unknown, 48);
  return dates.map((closedAt, position) =>
    seedOf({
      family,
      arm: 'unknown',
      position,
      key: keyOf(family, 'unknown', position, ids),
      createdAt: addHours(closedAt, -leads[position] - QUEUE_H),
      closedAt,
      leadTimeH: leads[position],
      failure: CLEAN,
      level: 'unknown',
      source: 'adoption-date',
      commits: commitsOf(family.nature, position),
    }),
  );
}

/** The seed of one open ticket, declared by hand (SPEC §8 guardrails). */
function openSeed(spec: OpenTicketSpec, family: FamilyPlan): Seed {
  const failure: SeedFailure = { ...CLEAN, incidents: spec.incidents };
  return seedOf({
    family,
    arm: spec.level === 'unknown' ? 'unknown' : spec.level === 'none' ? 'human' : 'agent',
    position: 0,
    key: spec.key,
    createdAt: spec.createdAt,
    closedAt: '',
    leadTimeH: 0,
    failure,
    level: spec.level,
    source: spec.source,
    commits: spec.commits,
    nature: spec.nature,
    zone: spec.zone,
    size: spec.size,
    summary: spec.summary,
    hasDescription: spec.acceptance,
  });
}

/** The closed tickets of one family: the two arms, then the unknown ones. */
function closedSeeds(family: FamilyPlan, ids: { ticket(): string }): readonly Seed[] {
  const total = family.agent.count + family.human.count;
  const dates = spreadDates(family.from, family.to, total);
  const agentDates = dates.filter((_date, index) => index % 2 === 0);
  const humanDates = dates.filter((_date, index) => index % 2 === 1);
  return [
    ...armSeeds(family, 'agent', family.agent, agentDates, ids),
    ...armSeeds(family, 'human', family.human, humanDates, ids),
    ...unknownSeeds(family, ids),
  ];
}

/** Every ticket of the demo dataset, as a seed, before the derivations. */
export function ticketSeeds(): readonly Seed[] {
  const ids = makeIds();
  const seeds: Seed[] = [];
  for (const family of FAMILIES) {
    seeds.push(...closedSeeds(family, ids));
    for (const spec of family.open) seeds.push(openSeed(spec, family));
  }
  return seeds;
}
