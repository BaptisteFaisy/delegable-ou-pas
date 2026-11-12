/**
 * Executable conditions: a recommendation becomes a checkable guardrail
 * (SPEC §12 "ce qui ferait passer une case du rouge à l'orange", SPEC §8
 * "Les garde-fous", SPEC §5, SPEC §16 bilingual strings; DP-12, DP-17, DP-26).
 *
 * A condition is derived from the recommendation AND from the failure causes of
 * the cohort: a cohort whose reopenings come from non-replayable migrations
 * requires a migration test. The check is three-valued — `satisfied: null`
 * means "not verifiable" (missing right, no pull request) and is never a
 * failure nor a success (SPEC §5); `allSatisfied` is false as soon as one
 * unknown appears, and the report says how many.
 *
 * No commit message, no person identifier ever crosses this module (DP-17):
 * facts arrive as booleans with a detail already stripped by the adapter.
 *
 * The domain is pure: no `@forge/*`, no `Date.now()`, no I/O. Deterministic.
 */
import type { FailureCause } from '../ports.js';
import type { Recommendation } from '../types-advice.js';

/* -------------------------------------------------------------------- kinds */

/** The six executable conditions of SPEC §12 / SPEC §8. */
export type ConditionKind =
  | 'acceptance-criteria'
  | 'migration-test'
  | 'zone-owner-review'
  | 'two-reviewers'
  | 'evidence-per-criterion'
  | 'no-sensitive-zone';

/** The six kinds, in a stable order: reports and derivations follow it. */
export const CONDITION_KINDS: readonly ConditionKind[] = [
  'acceptance-criteria',
  'migration-test',
  'zone-owner-review',
  'two-reviewers',
  'evidence-per-criterion',
  'no-sensitive-zone',
];

/** The visible label of each kind, in both languages (SPEC §16). */
const LABELS: Readonly<Record<ConditionKind, { readonly en: string; readonly fr: string }>> = {
  'acceptance-criteria': {
    en: 'the ticket states acceptance criteria',
    fr: "le ticket énonce des critères d'acceptation",
  },
  'migration-test': {
    en: 'a replayable migration test ships with the change',
    fr: 'un test de migration rejouable accompagne le changement',
  },
  'zone-owner-review': {
    en: 'the zone owner reviewed the change',
    fr: 'le propriétaire de la zone a relu le changement',
  },
  'two-reviewers': {
    en: 'two distinct reviewers read the change',
    fr: 'deux relecteurs distincts ont lu le changement',
  },
  'evidence-per-criterion': {
    en: 'each criterion carries its evidence',
    fr: 'chaque critère porte sa preuve',
  },
  'no-sensitive-zone': {
    en: 'the change touches no sensitive zone',
    fr: 'le changement ne touche aucune zone sensible',
  },
};

/** Builds the visible label of a kind: key, then English, then French (SPEC §16). */
export function conditionLabel(kind: ConditionKind): string {
  const label = LABELS[kind];
  return `${kind} — ${label.en} — ${label.fr}`;
}

/* ------------------------------------------------------------ conditions */

/**
 * One executable condition (local name: `Condition` already exists in
 * `src/db/memory-sql-parse.ts`, the homonym is never imported here).
 */
export interface ExecutableCondition {
  readonly kind: ConditionKind;
  readonly label: string;
  readonly required: boolean;
}

/** One fact observed by the adapter: three-valued, message-free (SPEC §5, DP-17). */
export interface ConditionFact {
  readonly kind: ConditionKind;
  readonly observed: boolean | null;
  readonly detail: string;
}

/** One condition checked against the facts; `satisfied: null` = not verifiable. */
export interface ConditionCheck {
  readonly kind: ConditionKind;
  readonly satisfied: boolean | null;
  readonly evidence: string;
  readonly checkedAt: string;
}

/** The report: every check, the verdict, and how many unknowns it hides. */
export interface ConditionReport {
  readonly checks: readonly ConditionCheck[];
  readonly allSatisfied: boolean;
  readonly unknownCount: number;
}

/** Evidence of a condition with no fact at all (no right, no pull request). */
export const NOT_VERIFIABLE: string = 'not verifiable — non vérifiable';

/* ----------------------------------------------------------- derivation */

/** What each recommendation requires and advises, before the cohort causes. */
interface BaseConditions {
  readonly required: readonly ConditionKind[];
  readonly advisory: readonly ConditionKind[];
}

const BASE_CONDITIONS: Readonly<Record<Recommendation, BaseConditions>> = {
  delegate: {
    required: ['acceptance-criteria', 'evidence-per-criterion'],
    advisory: [],
  },
  'delegate-with-review': {
    required: ['acceptance-criteria', 'evidence-per-criterion', 'two-reviewers'],
    advisory: ['zone-owner-review'],
  },
  'keep-human': { required: [], advisory: [] },
  'not-enough-data': { required: [], advisory: [] },
};

/**
 * Failure-cause keywords per condition, bilingual (SPEC §12, DP-26).
 * Order is the priority: `no-sensitive-zone` before `zone-owner-review`, so
 * "zone sensible" never derives a review condition.
 */
const CAUSE_PATTERNS: readonly { readonly kind: ConditionKind; readonly pattern: RegExp }[] = [
  { kind: 'migration-test', pattern: /migration|migrate/ },
  { kind: 'no-sensitive-zone', pattern: /sensible|sensitive/ },
  { kind: 'acceptance-criteria', pattern: /critère|critere|criteria|acceptation|acceptance/ },
  { kind: 'evidence-per-criterion', pattern: /preuve|evidence/ },
  { kind: 'two-reviewers', pattern: /two reviewers|deux relecteurs|relecteurs/ },
  { kind: 'zone-owner-review', pattern: /relecture|review|propriétaire|proprietaire|owner|zone/ },
];

/** The condition a failure cause asks for; null when the cause asks for none. */
function kindForCause(cause: string): ConditionKind | null {
  const lowered = cause.toLowerCase();
  for (const entry of CAUSE_PATTERNS) {
    if (entry.pattern.test(lowered)) return entry.kind;
  }
  return null;
}

/**
 * Local converter: the frozen contract types a failure cause as an interface
 * (`FailureCause`, `src/ports.ts`), while the derivation works on plain cause
 * strings. Counts are left to the cohort statistics (zero duplication).
 */
export function failureCauseLabels(causes: readonly FailureCause[]): readonly string[] {
  return causes.map(cause => cause.cause);
}

/**
 * Derives the executable conditions of a ticket: what the recommendation
 * requires, plus what the failure causes of its cohort demand (SPEC §12).
 * A kind appears once, in `CONDITION_KINDS` order; a cause upgrades an
 * advisory kind to required. Deterministic.
 */
export function conditionsFor(
  recommendation: Recommendation,
  cohortCauses: readonly string[],
): readonly ExecutableCondition[] {
  const base = BASE_CONDITIONS[recommendation];
  const required = new Set<ConditionKind>(base.required);
  const kinds = new Set<ConditionKind>([...base.required, ...base.advisory]);
  for (const cause of cohortCauses) {
    const kind = kindForCause(cause);
    if (kind === null) continue;
    kinds.add(kind);
    required.add(kind);
  }
  return CONDITION_KINDS.filter(kind => kinds.has(kind)).map(kind => ({
    kind,
    label: conditionLabel(kind),
    required: required.has(kind),
  }));
}

/* --------------------------------------------------------------- checking */

/** Checks one condition against the facts: no fact, or `observed: null` → unknown. */
function check(
  condition: ExecutableCondition,
  facts: readonly ConditionFact[],
  checkedAt: string,
): ConditionCheck {
  const fact = facts.find(candidate => candidate.kind === condition.kind);
  return {
    kind: condition.kind,
    satisfied: fact === undefined ? null : fact.observed,
    evidence: fact === undefined ? NOT_VERIFIABLE : fact.detail,
    checkedAt,
  };
}

/**
 * Checks every condition and reports (SPEC §5: the unknown is never a failure
 * nor a success). `allSatisfied` is true only when every check is `true`: one
 * `null` or one `false` makes it false, and `unknownCount` says how many
 * checks stayed unknown. `checkedAt` is passed by the caller (the domain owns
 * no clock); it stays empty when the caller has none.
 */
export function checkConditions(
  conditions: readonly ExecutableCondition[],
  facts: readonly ConditionFact[],
  checkedAt: string = '',
): ConditionReport {
  const checks = conditions.map(condition => check(condition, facts, checkedAt));
  return {
    checks,
    allSatisfied: checks.every(candidate => candidate.satisfied === true),
    unknownCount: checks.filter(candidate => candidate.satisfied === null).length,
  };
}
