/**
 * SPEC §13, §24 · DP-20, DP-22 — the shapes of the demo dataset.
 *
 * The dataset is generated from *scenarios* instead of being copied one by one
 * (SPEC §24.1): each scenario declares its cohort, its two arms, its failures
 * and its window, and `builder.ts` spreads the tickets over it. The scenarios
 * themselves live in `scenarios.ts`; the named edge cases live in
 * `cas-limites.ts`. This module keeps the shapes every other module shares.
 *
 * The tickets the SPEC quotes by name keep their key: `PROJ-412` (the ticket the
 * video shows), `PROJ-207`, `PROJ-233` and `PROJ-301` (the tickets its advice
 * rests on), plus the showcase tickets of the guardrails (SPEC §8).
 *
 * No person appears here: only roles and robot accounts (SPEC §18, DP-17).
 */
import type { ClassifiedBy, Level, Nature, Size, Source, Zone } from '../types.js';
import type { OpenShowcase } from './cas-limites.js';
import { ALL_SCENARIOS } from './scenarios.js';

/* ------------------------------------------------------------------- shapes */

/** The three arms of the dataset: with an agent, without, or unknown (DP-03). */
export type SeedArm = 'agent' | 'human' | 'unknown';

/** What went wrong with one ticket (SPEC §6 "Mesurer ce qui arrive ensuite"). */
export interface SeedFailure {
  readonly reopened: boolean;
  readonly causedBugs: number;
  readonly incidents: number;
  readonly takeover: boolean;
  readonly abandoned: boolean;
}

/**
 * How many failures one arm carries (SPEC §6).
 *
 * A compact plan instead of one literal per ticket: `incidents` and `takeover`
 * are modifiers of a failure, `reopened`, `causedBugs` and `abandoned` are the
 * failures themselves, so `count - clean` must equal their sum.
 */
export interface FailurePlan {
  readonly reopened?: number;
  readonly causedBugs?: number;
  readonly incidents?: number;
  readonly takeover?: number;
  readonly abandoned?: number;
}

/** One ticket of the demo dataset, before it becomes a domain fact. */
export interface Seed {
  readonly id: string;
  readonly key: string;
  readonly family: string;
  readonly epochId: string;
  readonly nature: Nature;
  readonly zone: Zone;
  readonly size: Size;
  readonly arm: SeedArm;
  readonly level: Level;
  readonly source: Source;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string;
  readonly closedStatus: string;
  readonly status: string;
  readonly leadTimeH: number;
  readonly failure: SeedFailure;
  readonly neighborBugs: number;
  readonly reopenedAt: string;
  readonly reopenDurationMin: number;
  readonly sprintId: string;
  readonly storyPoints: number | null;
  readonly issueType: string;
  readonly summary: string;
  readonly hasDescription: boolean;
  readonly component: string;
  readonly labels: readonly string[];
  readonly classifiedBy: ClassifiedBy;
  readonly sizeEstimated: boolean;
  /** Number of commits of the ticket: zero for a ticket without code (SPEC §21). */
  readonly commits: number;
  /** Number of signed commits when the ticket mixes signed and unsigned ones. */
  readonly signedCommits: number;
  /** True when the ticket carries a heavier review than the rest (SPEC §6). */
  readonly heavyReview: boolean;
  /** Place of the ticket inside its family arm: every derivation is stable. */
  readonly position: number;
  /** The role that worked on the ticket: never a person (SPEC §18, DP-17). */
  readonly role: string;
  /** The named case the ticket demonstrates, empty when it demonstrates none. */
  readonly cas: string;
  /** The project the ticket was moved from, empty when it never moved. */
  readonly movedFromProject: string;
  /** The state of the controlled trial for this ticket (SPEC §11). */
  readonly trial: '' | 'in-trial' | 'left-trial';
  /** Why the ticket left the trial, when it did (SPEC §11, recipe 16). */
  readonly trialReason: string;
}

/** One arm of a family: how many tickets, how many clean, which failures. */
export interface ArmPlan {
  readonly count: number;
  readonly clean: number;
  readonly medianH: number;
  readonly failures: FailurePlan;
  /** Tickets of the arm that are still open: censored, never counted in a rate. */
  readonly open?: number;
  /** Source of the human arm; the agent arm cycles through the four (SPEC §5). */
  readonly source?: Source;
}

/** One family of tickets: a cohort, an epoch, two arms, a window of dates. */
export interface FamilyPlan {
  readonly id: string;
  readonly epochId: string;
  readonly nature: Nature;
  readonly zone: Zone;
  readonly size: Size;
  readonly agent: ArmPlan;
  readonly human: ArmPlan;
  /** Tickets whose involvement could not be read (SPEC §5, DP-03). */
  readonly unknown: number;
  readonly open: readonly OpenShowcase[];
  readonly from: string;
  readonly to: string;
  readonly summary: string;
  readonly issueType?: string;
  readonly classifiedBy?: ClassifiedBy;
  readonly sizeEstimated?: boolean;
  readonly description?: 'full' | 'none';
  readonly labels?: readonly string[];
  /** True when the family carries a heavier review than the rest (SPEC §6). */
  readonly heavyReview?: boolean;
  /** The roles that worked on this family: a cohort of two is masked (DP-17). */
  readonly roles?: readonly string[];
}

/* ------------------------------------------------------------------ helpers */

/** The arm of the agent: the three levels the team uses (SPEC §5). */
export const AGENT_LEVELS: readonly Level[] = ['assisted', 'driven', 'autonomous'];

/** The sources of the agent arm, safest first (SPEC §5 "Cinq sources"). */
export const AGENT_SOURCES: readonly Source[] = ['mcp-declaration', 'bot-author', 'commit-mention', 'closure-field'];

/** The roles the demo project declares: three people and one robot (SPEC §18). */
export const SAMPLE_ROLES: readonly string[] = ['dev-1', 'dev-2', 'dev-3'];

/* ------------------------------------------------------------------ families */

/**
 * The families of the demo dataset: every scenario of `scenarios.ts`, in order.
 *
 * The figures are the ones the scenarios declare, to the digit; the generator
 * unfolds them, so the cohort of `PROJ-412` is the cohort the brief asks for
 * (SPEC §8) and not a draw that happens to look like it.
 */
export const FAMILIES: readonly FamilyPlan[] = ALL_SCENARIOS;

/** The issue type a nature carries in the demo project (SPEC §16.5). */
export const ISSUE_TYPES: Readonly<Record<string, string>> = {
  bugfix: 'Bug',
  'ui-change': 'Story',
  'data-migration': 'Task',
  refactor: 'Task',
  tests: 'Task',
  configuration: 'Task',
  'external-integration': 'Story',
  'no-code': 'Task',
};

/** The issue type of one nature, with a fallback (SPEC §16.5). */
export function issueTypeOf(nature: Nature): string {
  return ISSUE_TYPES[nature] ?? 'Task';
}

/** The open tickets of the demo: the guardrails of SPEC §8, one by one. */
export { OPEN_SHOWCASE } from './cas-limites.js';

/** The type of the open tickets, so the rest of the base stays typed. */
export type { OpenShowcase } from './cas-limites.js';
