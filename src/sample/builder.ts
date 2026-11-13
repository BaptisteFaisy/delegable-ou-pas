/**
 * SPEC §13, §24 · DP-20 — the demo dataset builder.
 *
 * The builder turns the catalogue of scenarios into the facts the app stores:
 * tickets, status histories, commits, pull requests, outcomes, involvements and
 * classifications. It is plain data: no `@forge/*`, no database, no clock of
 * its own (the reference date is fixed in `project.ts`). The demo mode plugs
 * this builder in front of the domain instead of the Forge bridges (lot L7).
 *
 * The scenarios are the single source of the figures: the documents of the demo
 * never write a number by hand, the tests compare them with what the builder
 * produces (SPEC §24.1, DP-20). A named ticket (SPEC §21, §22) is built by the
 * same constructor as any other ticket, only its parameters change.
 */
import type { Level, Nature, Size, Source, Zone } from '../types.js';
import type { ArmPlan, FamilyPlan, Seed, SeedArm, SeedFailure } from './issues.js';
import { AGENT_LEVELS, AGENT_SOURCES, FAMILIES, SAMPLE_ROLES, issueTypeOf } from './issues.js';
import { casLimiteAt } from './cas-limites.js';
import type { SeedAdjust } from './cas-limites.js';
import {
  addHours,
  dateFromDay,
  dayNumber,
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

/** The minutes a reopening lasts when the scenario does not say (SPEC §6). */
const DEFAULT_REOPEN_MIN = 120;

/** The days of the window a censored ticket may have been created in. */
const CENSORED_WINDOW_DAYS = 45;

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

/** The role that worked on a ticket: a role, never a person (SPEC §18). */
function roleOf(family: FamilyPlan, position: number): string {
  const roles = family.roles ?? SAMPLE_ROLES;
  return roles[position % roles.length];
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
  readonly role: string;
  /** Overrides of the named tickets (SPEC §21, §22) and of the open ones. */
  readonly nature?: Nature;
  readonly zone?: Zone;
  readonly size?: Size;
  readonly summary?: string;
  readonly hasDescription?: boolean;
  readonly neighborBugs?: number;
  readonly reopenedAt?: string;
  readonly reopenDurationMin?: number;
  readonly signedCommits?: number;
  readonly movedFromProject?: string;
  readonly trial: '' | 'in-trial' | 'left-trial';
  readonly trialReason: string;
  readonly cas: string;
}

/** One seed of the demo dataset (SPEC §24.1). */
function seedOf(input: SeedInput): Seed {
  const closed = input.closedAt !== '';
  const status = input.failure.abandoned ? 'Abandonné' : 'Terminé';
  const nature = input.nature ?? input.family.nature;
  const zone = input.zone ?? input.family.zone;
  const size = input.size ?? input.family.size;
  const durationMin = input.reopenDurationMin ?? (input.failure.reopened ? DEFAULT_REOPEN_MIN : 0);
  const reopenedAt = input.reopenedAt ?? (durationMin > 0 && closed ? addHours(input.closedAt, -durationMin / 60) : '');
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
    neighborBugs: input.neighborBugs ?? (input.position % 13 === 5 ? 1 : 0),
    reopenedAt,
    reopenDurationMin: durationMin,
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
    signedCommits: input.signedCommits ?? 0,
    heavyReview: input.family.heavyReview ?? false,
    position: input.position,
    role: input.role,
    cas: input.cas,
    movedFromProject: input.movedFromProject ?? '',
    trial: input.trial,
    trialReason: input.trialReason ?? '',
  };
}

/** The adjustments of a named ticket, applied over the computed ticket. */
function adjusted(input: SeedInput, adjust: SeedAdjust): SeedInput {
  const failure = adjust.failure === undefined ? input.failure : { ...input.failure, ...adjust.failure };
  return {
    ...input,
    failure,
    level: adjust.level ?? input.level,
    source: adjust.source ?? input.source,
    nature: adjust.nature ?? input.nature,
    zone: adjust.zone ?? input.zone,
    size: adjust.size ?? input.size,
    summary: adjust.summary ?? input.summary,
    hasDescription: adjust.hasDescription ?? input.hasDescription,
    commits: adjust.commits ?? input.commits,
    closedAt: adjust.closedAt ?? input.closedAt,
    createdAt: adjust.createdAt ?? input.createdAt,
    leadTimeH: adjust.leadTimeH ?? input.leadTimeH,
    neighborBugs: adjust.neighborBugs ?? input.neighborBugs,
    reopenedAt: adjust.reopenedAt ?? input.reopenedAt,
    reopenDurationMin: adjust.reopenDurationMin ?? input.reopenDurationMin,
    signedCommits: adjust.signedCommits ?? input.signedCommits,
    movedFromProject: adjust.movedFromProject ?? input.movedFromProject,
    trial: adjust.trial ?? input.trial,
    trialReason: adjust.trialReason ?? input.trialReason,
  };
}

/** The seeds of one arm of one family: the closed tickets, then the censored ones. */
function armSeeds(
  family: FamilyPlan,
  arm: SeedArm,
  plan: ArmPlan,
  ids: { ticket(): string },
): readonly Seed[] {
  const failures = failureList(plan.failures);
  const leads = leadTimes(plan.count, plan.medianH);
  const dates = spreadDates(family.from, family.to, plan.count);
  const closed = Array.from({ length: plan.count }, (_unused, position) => {
    const closedAt = dates[position] ?? `${family.to}T12:00:00Z`;
    const failure = position < plan.clean ? CLEAN : failures[position - plan.clean] ?? CLEAN;
    const source = sourceOf(arm, plan, position);
    const cas = casLimiteAt(family.id, arm, position);
    const base: SeedInput = {
      family,
      arm,
      position,
      key: cas?.key ?? ids.ticket(),
      createdAt: addHours(closedAt, -leads[position] - QUEUE_H),
      closedAt,
      leadTimeH: leads[position],
      failure,
      level: levelOf(arm, source, position),
      source,
      commits: commitsOf(family.nature, position),
      role: roleOf(family, position),
      trial: '',
      trialReason: '',
      cas: cas?.cas ?? '',
    };
    return seedOf(cas === undefined ? base : adjusted(base, cas.adjust));
  });
  return [...closed, ...censoredSeeds(family, arm, plan, ids)];
}

/** The seeds of the tickets of an arm that are still open: censored (SPEC §21). */
function censoredSeeds(
  family: FamilyPlan,
  arm: SeedArm,
  plan: ArmPlan,
  ids: { ticket(): string },
): readonly Seed[] {
  const count = plan.open ?? 0;
  if (count <= 0) return [];
  const last = dayNumber(family.to.slice(0, 10));
  const start = dateFromDay(Math.max(dayNumber(family.from.slice(0, 10)), last - CENSORED_WINDOW_DAYS));
  const dates = spreadDates(start, family.to, count);
  return dates.map((createdAt, index) => {
    const position = plan.count + index;
    const source = sourceOf(arm, plan, position);
    const cas = casLimiteAt(family.id, arm, position);
    const base: SeedInput = {
      family,
      arm,
      position,
      key: cas?.key ?? ids.ticket(),
      createdAt,
      closedAt: '',
      leadTimeH: 0,
      failure: CLEAN,
      level: levelOf(arm, source, position),
      source,
      commits: commitsOf(family.nature, position),
      role: roleOf(family, position),
      trial: '',
      trialReason: '',
      cas: cas?.cas ?? '',
    };
    return seedOf(cas === undefined ? base : adjusted(base, cas.adjust));
  });
}

/** The seeds of the tickets whose involvement could not be read (DP-03). */
function unknownSeeds(family: FamilyPlan, ids: { ticket(): string }): readonly Seed[] {
  if (family.unknown <= 0) return [];
  const dates = spreadDates(family.from, family.to, family.unknown);
  const leads = leadTimes(family.unknown, 48);
  return dates.map((closedAt, position) => {
    const cas = casLimiteAt(family.id, 'unknown', position);
    const base: SeedInput = {
      family,
      arm: 'unknown',
      position,
      key: cas?.key ?? ids.ticket(),
      createdAt: addHours(closedAt, -leads[position] - QUEUE_H),
      closedAt,
      leadTimeH: leads[position],
      failure: CLEAN,
      level: 'unknown',
      source: 'adoption-date',
      commits: commitsOf(family.nature, position),
      role: roleOf(family, position),
      trial: '',
      trialReason: '',
      cas: cas?.cas ?? '',
    };
    return seedOf(cas === undefined ? base : adjusted(base, cas.adjust));
  });
}

/** The seed of one open ticket, declared by hand (SPEC §8 guardrails). */
function openSeed(spec: FamilyPlan['open'][number], family: FamilyPlan): Seed {
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
    role: roleOf(family, 0),
    nature: spec.nature,
    zone: spec.zone,
    size: spec.size,
    summary: spec.summary,
    hasDescription: spec.acceptance,
    trial: '',
    trialReason: '',
    cas: '',
  });
}

/** Every ticket of the demo dataset, as a seed, before the derivations. */
export function ticketSeeds(): readonly Seed[] {
  const ids = makeIds();
  const seeds: Seed[] = [];
  for (const family of FAMILIES) {
    seeds.push(...armSeeds(family, 'agent', family.agent, ids));
    seeds.push(...armSeeds(family, 'human', family.human, ids));
    seeds.push(...unknownSeeds(family, ids));
    for (const spec of family.open) seeds.push(openSeed(spec, family));
  }
  return seeds;
}
