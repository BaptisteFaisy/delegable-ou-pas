/**
 * Cohorts: same nature, same zone, same size — DP-07.
 *
 * SPEC §4 "Cohorte" and "Bras", §7 rule 1 (a fallback is announced, never
 * silent), §7 rule 8 and DP-17 (no name of a person is rendered here),
 * §12 "the map", §21 edge cases (a cohort without a human arm, a team of three,
 * a ticket moved to another project), DP-03 (an unknown involvement belongs to
 * no arm), DP-26 (the most frequent causes of failure).
 *
 * Pure domain: the figures themselves are computed by the statistics lot, this
 * module hands it the ticket lists, the arms and the counts.
 */
import type { Arm, CohortKey, CohortLevel, IssueClass, Level } from '../types.js';
import { COHORT_FALLBACK, COHORT_LEVELS, LEVEL_HAS_AGENT, NATURE_NO_CODE } from '../types.js';
import type { FailureCause, LlmGateway } from '../ports.js';
import { isCodeNature } from './nature.js';

/* ------------------------------------------------------------------ the keys */

/** The cohort key of a classification, at the asked level (SPEC §4 "Cohorte"). */
export function cohortKeyOf(issueClass: IssueClass, level: CohortLevel): CohortKey {
  if (level === 'nature-zone-size') {
    return { level, nature: issueClass.nature, zone: issueClass.zone, size: issueClass.size };
  }
  if (level === 'nature-size') {
    return { level, nature: issueClass.nature, zone: null, size: issueClass.size };
  }
  return { level: 'nature', nature: issueClass.nature, zone: null, size: null };
}

/**
 * One level up, through `COHORT_FALLBACK` (SPEC §7 rule 1); null at the top.
 *
 * The level is part of the key, so a widening stays visible.
 */
export function widen(key: CohortKey): CohortKey | null {
  const next = COHORT_FALLBACK[key.level];
  if (next === null) return null;
  if (next === 'nature-size') return { level: next, nature: key.nature, zone: null, size: key.size };
  return { level: 'nature', nature: key.nature, zone: null, size: null };
}

/** The arm of an involvement level; null when it is unknown (DP-03). */
export function armOf(level: Level): Arm | null {
  if (level === 'unknown') return null;
  return LEVEL_HAS_AGENT[level] ? 'agent' : 'human';
}

/* ------------------------------------------------------- stable serialization */

const SEPARATOR = '|';
const NULL_FIELD = '-';

function escapeField(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function unescapeField(value: string): string {
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '\\' && index + 1 < value.length) {
      index += 1;
      out += value[index];
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * The stable text of a cohort key, the format of the `cohort_key` column
 * (SPEC §18): level, nature, zone, size; a null field is written `-`.
 */
export function cohortKeyString(key: CohortKey): string {
  return [key.level, key.nature, key.zone ?? NULL_FIELD, key.size ?? NULL_FIELD]
    .map(escapeField)
    .join(SEPARATOR);
}

function splitFields(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '\\' && index + 1 < value.length) {
      index += 1;
      current += char + value[index];
    } else if (char === SEPARATOR) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/** The cohort key of a stored text; null when the text is not a key. */
export function parseCohortKey(value: string): CohortKey | null {
  const parts = splitFields(value).map(unescapeField);
  if (parts.length !== 4) return null;
  const [level, nature, zone, size] = parts;
  if (!COHORT_LEVELS.includes(level as CohortLevel)) return null;
  return {
    level: level as CohortLevel,
    nature,
    zone: zone === NULL_FIELD ? null : zone,
    size: size === NULL_FIELD ? null : size,
  };
}

/**
 * True when a classification belongs to the cohort.
 *
 * The nature reserved to the work without commit never enters a code cohort
 * (SPEC §21).
 */
export function isInCohort(key: CohortKey, issueClass: IssueClass): boolean {
  if (issueClass.nature === NATURE_NO_CODE) return key.nature === NATURE_NO_CODE;
  if (issueClass.nature !== key.nature) return false;
  if (key.level === 'nature-zone-size') return issueClass.zone === key.zone && issueClass.size === key.size;
  if (key.level === 'nature-size') return issueClass.size === key.size;
  return true;
}

/* -------------------------------------------------------------------- tickets */

/**
 * One ticket of a cohort: its involvement level and its classification.
 *
 * The involvement and the outcome are stored by ticket id (SPEC §18), so a
 * ticket moved to another project keeps both and only changes cohort.
 */
export interface CohortTicket {
  readonly issueId: string;
  readonly projectId: string;
  readonly level: Level;
  readonly issueClass: IssueClass;
}

/** A ticket moved to another project: same involvement, same class, new cohort. */
export function moveTicketToProject(ticket: CohortTicket, projectId: string): CohortTicket {
  return { ...ticket, projectId };
}

/* ---------------------------------------------------------------------- arms */

/** The two arms of a cohort, and the share of the tickets of unknown involvement. */
export interface CohortArms {
  readonly agent: readonly CohortTicket[];
  readonly human: readonly CohortTicket[];
  /** Out of both arms (DP-03): never counted as "without agent". */
  readonly unknown: readonly CohortTicket[];
  readonly total: number;
  readonly unknownCount: number;
  /** Fraction of the cohort whose involvement is unknown, in [0, 1]. */
  readonly unknownShare: number;
}

/** Splits the tickets of one cohort into its two arms (SPEC §4 "Bras"). */
export function buildArms(tickets: readonly CohortTicket[]): CohortArms {
  const agent: CohortTicket[] = [];
  const human: CohortTicket[] = [];
  const unknown: CohortTicket[] = [];
  for (const ticket of tickets) {
    const arm = armOf(ticket.level);
    if (arm === 'agent') agent.push(ticket);
    else if (arm === 'human') human.push(ticket);
    else unknown.push(ticket);
  }
  const total = tickets.length;
  return {
    agent,
    human,
    unknown,
    total,
    unknownCount: unknown.length,
    unknownShare: total === 0 ? 0 : unknown.length / total,
  };
}

/** The counts of the two arms and of the unknown tickets. */
export function armCounts(arms: CohortArms): { readonly agent: number; readonly human: number; readonly unknown: number } {
  return { agent: arms.agent.length, human: arms.human.length, unknown: arms.unknown.length };
}

/** What the screen says about the tickets of unknown involvement (DP-03). */
export function unknownShareMessage(arms: CohortArms): string {
  const percent = Math.round(arms.unknownShare * 100);
  return `${percent} % des tickets de ce projet sont d'implication inconnue`;
}

/* ------------------------------------------------------------ cohort resolution */

/** How broad the rendered cohort is: the three levels, or the whole project. */
export type CohortScope = CohortLevel | 'project';

/** The cohort the app renders, with the level it had to fall back to. */
export interface CohortResolution {
  readonly scope: CohortScope;
  /** Null when the app had to render the whole project. */
  readonly key: CohortKey | null;
  readonly level: CohortLevel;
  readonly fellBack: boolean;
  /** Why the app went up, said out loud (SPEC §7 rule 1). */
  readonly reason: string;
  readonly sampleSize: number;
}

/** A team of three or fewer: most cohorts are too narrow to be shown (SPEC §21). */
export const SMALL_TEAM_MAX = 3;

function describeLevel(level: CohortScope): string {
  if (level === 'nature-zone-size') return 'nature × zone × taille';
  if (level === 'nature-size') return 'nature × taille';
  if (level === 'nature') return 'nature';
  return 'projet';
}

function fallbackReason(from: CohortScope, to: CohortScope, sampleSize: number): string {
  return `cohorte « ${describeLevel(from)} » trop petite : l'app remonte d'un niveau à « ${describeLevel(to)} » (${sampleSize} tickets) et le dit`;
}

function countIn(key: CohortKey, tickets: readonly CohortTicket[]): number {
  let count = 0;
  for (const ticket of tickets) {
    if (isInCohort(key, ticket.issueClass)) count += 1;
  }
  return count;
}

/**
 * The level at which a cohort can be rendered (DP-07, SPEC §7 rule 1).
 *
 * nature × zone × taille → nature × taille → nature → the whole project; every
 * fallback is announced. A team of three goes straight to the project level:
 * the masking of narrow cohorts is done by the privacy lot (SPEC §21).
 */
export function resolveCohortScope(
  key: CohortKey,
  tickets: readonly CohortTicket[],
  minimum: number,
  peopleCount: number | null = null,
): CohortResolution {
  if (peopleCount !== null && peopleCount <= SMALL_TEAM_MAX) {
    return {
      scope: 'project',
      key: null,
      level: 'nature',
      fellBack: true,
      reason: `équipe de ${peopleCount} personnes : les cohortes étroites sont masquées, l'app rend le niveau projet`,
      sampleSize: tickets.length,
    };
  }
  return resolveBySize(key, tickets, minimum);
}

function resolveBySize(key: CohortKey, tickets: readonly CohortTicket[], minimum: number): CohortResolution {
  let current = key;
  let sampleSize = countIn(current, tickets);
  if (sampleSize >= minimum) {
    return { scope: current.level, key: current, level: current.level, fellBack: false, reason: 'cohorte suffisante au niveau le plus précis', sampleSize };
  }
  let widened = widen(current);
  while (widened !== null) {
    const size = countIn(widened, tickets);
    if (size >= minimum) {
      return { scope: widened.level, key: widened, level: widened.level, fellBack: true, reason: fallbackReason(key.level, widened.level, size), sampleSize: size };
    }
    current = widened;
    widened = widen(current);
  }
  return {
    scope: 'project',
    key: null,
    level: 'nature',
    fellBack: true,
    reason: `même au niveau ${describeLevel('nature')} la cohorte reste trop petite : l'app rend le niveau projet`,
    sampleSize: countIn(current, tickets),
  };
}

/** The sentence the screen shows about the level it renders (SPEC §7 rule 1). */
export function resolutionMessage(resolution: CohortResolution): string {
  if (!resolution.fellBack) {
    return `Cohorte « ${describeLevel(resolution.scope)} » : ${resolution.sampleSize} tickets.`;
  }
  return resolution.reason;
}

/* ------------------------------------------------------------------- grouping */

/** One cohort and the tickets that belong to it. */
export interface CohortGroup {
  readonly key: CohortKey;
  readonly tickets: readonly CohortTicket[];
}

/**
 * Groups the tickets of one epoch into cohorts of the asked level.
 *
 * The work without commit stays out of the code cohorts (SPEC §21). The caller
 * filters by epoch first: a cohort never mixes two epochs (SPEC §7 rule 6).
 */
export function groupByCohort(tickets: readonly CohortTicket[], level: CohortLevel): readonly CohortGroup[] {
  const groups = new Map<string, CohortGroup>();
  for (const ticket of tickets) {
    if (!isCodeNature(ticket.issueClass.nature)) continue;
    const key = cohortKeyOf(ticket.issueClass, level);
    const id = cohortKeyString(key);
    const group = groups.get(id);
    if (group === undefined) groups.set(id, { key, tickets: [ticket] });
    else groups.set(id, { key: group.key, tickets: [...group.tickets, ticket] });
  }
  return [...groups.values()].sort((a, b) => cohortKeyString(a.key).localeCompare(cohortKeyString(b.key)));
}

/**
 * The cohorts of one epoch (SPEC §7 rule 6).
 *
 * A cohort is carried by a single epoch: the caller asks for one epoch at a
 * time, and the epoch id travels with the result, so no figure can mix two
 * epochs by accident.
 */
export interface EpochCohorts {
  /** Null for the work that predates the first epoch: kept, greyed out. */
  readonly epochId: string | null;
  readonly groups: readonly CohortGroup[];
}

/** The cohorts of one epoch, at the asked level. */
export function cohortsOfOneEpoch(
  epochId: string | null,
  tickets: readonly CohortTicket[],
  level: CohortLevel,
): EpochCohorts {
  return { epochId, groups: groupByCohort(tickets, level) };
}

/* -------------------------------------------------------------------- insight */

/** What the app says when a cohort cannot be compared (SPEC §21). */
export interface CohortInsight {
  readonly kind: 'no-human-arm' | 'complete';
  readonly message: string;
  /** Compare with the previous epoch, the only comparison left (SPEC §7 rule 6). */
  readonly compareWithPreviousEpoch: boolean;
  /** A controlled trial is the way back to two arms (SPEC §11). */
  readonly suggestControlledTrial: boolean;
}

/**
 * A cohort whose every ticket is now handed to the agents has no human arm:
 * the app says it, proposes the comparison with the previous epoch, and
 * suggests a controlled trial (SPEC §21).
 */
export function insightForArms(arms: CohortArms, hasPreviousEpoch: boolean = true): CohortInsight {
  if (arms.human.length === 0 && arms.agent.length > 0) {
    return {
      kind: 'no-human-arm',
      message: `tous les tickets de cette cohorte sont confiés aux agents (${arms.agent.length}) : le bras humain est vide, on ne peut plus comparer`,
      compareWithPreviousEpoch: hasPreviousEpoch,
      suggestControlledTrial: true,
    };
  }
  return { kind: 'complete', message: 'les deux bras sont présents', compareWithPreviousEpoch: false, suggestControlledTrial: false };
}

/* --------------------------------------------------------------- failure causes */

/** The most frequent causes of failure of a cohort (SPEC §12, DP-26). */
export interface FailureCausesSummary {
  readonly causes: readonly FailureCause[];
  readonly total: number;
  /** True when the model reached the asked limit: the list is bounded. */
  readonly truncated: boolean;
  /** True when the screen can fold the details and keep the first cause. */
  readonly foldable: boolean;
  readonly message: string;
}

/**
 * The causes that would move a cell from red to orange (DP-26): missing tests,
 * vague criteria, a zone without written conventions.
 *
 * The comments of the reopenings go through the model port; the result is
 * bounded and foldable, and an empty input never calls the model.
 */
export async function summarizeFailureCauses(
  comments: readonly string[],
  llm: LlmGateway,
  limit: number = 5,
): Promise<FailureCausesSummary> {
  if (comments.length === 0) {
    return { causes: [], total: 0, truncated: false, foldable: false, message: 'aucun commentaire de réouverture : pas de cause identifiée' };
  }
  const causes = await llm.summarizeFailureCauses(comments, limit);
  const total = causes.reduce((sum, cause) => sum + cause.count, 0);
  return {
    causes,
    total,
    truncated: causes.length >= limit,
    foldable: causes.length > 1,
    message: causes.length === 0
      ? 'aucune cause fréquente identifiée'
      : `ce qui ferait passer la case du rouge à l'orange : ${causes.map((cause) => cause.cause).join(', ')}`,
  };
}
