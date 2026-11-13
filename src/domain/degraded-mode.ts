/**
 * Degraded mode — what the app can still measure when the graph rights are
 * missing (SPEC §26 risk 1, SPEC §24, SPEC §17, SPEC §21; DP-19).
 *
 * A missing right never produces an error: it empties the result and writes
 * down what it empties ("un droit manquant ne produit pas d'erreur : il vide le
 * résultat", SPEC §17). Each capability the app cannot measure therefore
 * produces a written consequence, never a silent hole.
 *
 * The three levels:
 * - `full`: Jira and the graph are readable — everything stays measurable;
 * - `jira-only`: Jira is readable, the graph is not — the clean closure rests
 *   on the reopenings and the incidents (SPEC §21), the review load is ABSENT
 *   and says so (never a zero that looks like a measure), and the involvement
 *   falls back on the declared field or the adoption date, so the share of
 *   `unknown` explodes;
 * - `declared-only`: only the declarations can be read — the outcomes are
 *   emptied, not wrong.
 *
 * `widenThresholdForLevel` widens the minimum arm size (×1.5 in `jira-only`,
 * ×2 in `declared-only`) so the app refuses to conclude where it no longer has
 * the material to conclude (SPEC §7 rule 2).
 *
 * Visible strings are bilingual: `key — english — français` for the
 * capabilities, `english — français` for the consequences (SPEC §16).
 *
 * Pure domain: no `@forge/*`, no clock, no network. Rule: files < 500 lines,
 * functions < 50 lines.
 */
import type { GraphPermissionState as FrozenPermissionProbe } from '../types.js';
import { GRAPH_OBJECT_TYPES } from '../types.js';

/** The capability levels of the app, richest first (SPEC §26 risk 1). */
export type CapabilityLevel = 'full' | 'jira-only' | 'declared-only';

/**
 * One probed right, as the fallback reads it.
 *
 * This is NOT the frozen union `GraphPermissionState` of `src/types.ts`
 * ('granted' | 'missing' | 'unknown'): the brief freezes this richer shape
 * here, and `probeFromState` converts the frozen union towards it.
 */
export interface GraphPermissionState {
  /** The object the right covers: 'jira' or one of `GRAPH_OBJECT_TYPES`. */
  readonly object: string;
  /** True when the right was probed AND granted. */
  readonly granted: boolean;
  /** True when the right was actually probed; false when nobody knows. */
  readonly probed: boolean;
}

/** What the app can and cannot measure at one capability level (SPEC §17). */
export interface CapabilityReport {
  readonly level: CapabilityLevel;
  /** What the app can measure. */
  readonly available: readonly string[];
  /** What it cannot measure. */
  readonly unavailable: readonly string[];
  /** What the missing capabilities change on the conclusions. */
  readonly consequences: readonly string[];
}

/** The Jira read right, beside the four graph object types (SPEC §17). */
export const JIRA_CAPABILITY = 'jira';

/** One measurable capability: a stable key and a bilingual visible label. */
interface Capability {
  readonly key: string;
  readonly label: string;
}

/** Builds a visible label: stable key, then English, then French (SPEC §16). */
function capability(key: string, en: string, fr: string): Capability {
  return { key, label: `${key} — ${en} — ${fr}` };
}

/** Always readable: the declarations recorded by the team (SPEC §15). */
const DECLARED_CAPABILITIES: readonly Capability[] = [
  capability(
    'declared-involvement',
    'the involvement level declared by the team',
    "le niveau d'implication déclaré par l'équipe",
  ),
];

/** Readable as soon as Jira is readable (SPEC §6, SPEC §17). */
const JIRA_CAPABILITIES: readonly Capability[] = [
  capability('lead-time', 'the delay read from the ticket history', "le délai lu dans l'historique du ticket"),
  capability(
    'clean-closure',
    'the clean closure from the reopenings and the incidents',
    'la clôture propre par les réouvertures et les incidents',
  ),
  capability(
    'acceptance-criteria',
    'the acceptance criteria of the description',
    "les critères d'acceptation de la description",
  ),
  capability(
    'adoption-involvement',
    'the involvement deduced from the adoption date',
    "l'implication déduite de la date d'adoption",
  ),
];

/** Readable only with the graph rights (SPEC §17, SPEC §19). */
const GRAPH_CAPABILITIES: readonly Capability[] = [
  capability(
    'commit-involvement',
    'the involvement read in the commits and the pull requests',
    'l’implication lue dans les commits et les pull requests',
  ),
  capability('review-load', 'the review load of the pull requests', 'la charge de relecture des pull requests'),
  capability('commit-signatures', 'the signatures of the commits', 'les signatures des commits'),
  capability('tickets-without-commit', 'the tickets without any commit', 'les tickets sans commit'),
];

/** Consequence: the review load is absent, and says so — never a zero (SPEC §21). */
const CONSEQUENCE_REVIEW_ABSENT =
  'review load: not measurable here, announced absent and never rendered as a zero — ' +
  'charge de relecture : non mesurable ici, annoncée absente et jamais rendue comme un zéro';

/** Consequence: the involvement falls back, so the share of unknown explodes. */
const CONSEQUENCE_INVOLVEMENT_FALLBACK =
  'involvement: falls back on the declared field or the adoption date, so the share of unknown levels explodes — ' +
  "implication : repli sur le champ déclaré ou la date d'adoption, donc la part de niveaux inconnus explose";

/** Consequence: the graph is emptied, not wrong (SPEC §17). */
const CONSEQUENCE_GRAPH_EMPTY =
  'graph: no commit, no pull request, no signature — the outcome is emptied, not wrong — ' +
  'graphe : aucun commit, aucune pull request, aucune signature — le résultat est vidé, pas faux';

/** Consequence: the clean closure loses its Jira anchors too (SPEC §21). */
const CONSEQUENCE_CLEAN_EMPTY =
  'clean closure: can no longer rest on the reopenings nor on the incidents — the outcome is emptied, not wrong — ' +
  'clôture propre : ne peut plus reposer sur les réouvertures ni sur les incidents — le résultat est vidé, pas faux';

/** Consequence: the threshold widens ×1.5 in `jira-only` (SPEC §7 rule 2). */
const CONSEQUENCE_THRESHOLD_HALF =
  'minimum arm size: widened by half, so the app refuses to conclude where it no longer has the material — ' +
  "minimum par bras : élargi de moitié, l'app refuse de conclure là où elle n'a plus la matière";

/** Consequence: the threshold doubles in `declared-only` (SPEC §7 rule 2). */
const CONSEQUENCE_THRESHOLD_DOUBLE =
  'minimum arm size: doubled, so the app refuses to conclude where it no longer has the material — ' +
  "minimum par bras : doublé, l'app refuse de conclure là où elle n'a plus la matière";

/** Consequence of a right that was never probed: absent until proven granted. */
function unprobedConsequence(object: string): string {
  return (
    `right on ${object}: never probed, counted as absent until proven granted — ` +
    `droit sur ${object} : jamais sondé, compté comme absent tant qu'il n'est pas accordé`
  );
}

/** True when the right on `object` was probed and granted. */
function isGranted(permissions: readonly GraphPermissionState[], object: string): boolean {
  return permissions.some(permission => permission.object === object && permission.granted === true);
}

/** The level that follows from the two families of rights. */
function capabilityLevel(jira: boolean, graph: boolean): CapabilityLevel {
  if (jira && graph) return 'full';
  if (jira) return 'jira-only';
  return 'declared-only';
}

/** The written consequences of everything the level cannot measure (SPEC §17). */
function consequencesFor(
  level: CapabilityLevel,
  jira: boolean,
  graph: boolean,
  permissions: readonly GraphPermissionState[],
): readonly string[] {
  const consequences: string[] = [];
  if (!graph) {
    consequences.push(CONSEQUENCE_REVIEW_ABSENT, CONSEQUENCE_INVOLVEMENT_FALLBACK, CONSEQUENCE_GRAPH_EMPTY);
  }
  if (!jira) consequences.push(CONSEQUENCE_CLEAN_EMPTY);
  if (level === 'jira-only') consequences.push(CONSEQUENCE_THRESHOLD_HALF);
  if (level === 'declared-only') consequences.push(CONSEQUENCE_THRESHOLD_DOUBLE);
  for (const permission of permissions) {
    if (!permission.probed) consequences.push(unprobedConsequence(permission.object));
  }
  return consequences;
}

/**
 * What the app can still measure with the rights it actually has.
 *
 * Every missing capability lands in `unavailable` AND writes a consequence:
 * a missing right empties the result, it never fakes a measure (SPEC §17,
 * SPEC §21, DP-19).
 */
export function assessCapabilities(permissions: readonly GraphPermissionState[]): CapabilityReport {
  const jira = isGranted(permissions, JIRA_CAPABILITY);
  const graph = GRAPH_OBJECT_TYPES.every(object => isGranted(permissions, object));
  const level = capabilityLevel(jira, graph);
  const available = [
    ...DECLARED_CAPABILITIES,
    ...(jira ? JIRA_CAPABILITIES : []),
    ...(graph ? GRAPH_CAPABILITIES : []),
  ].map(entry => entry.label);
  const unavailable = [
    ...(jira ? [] : JIRA_CAPABILITIES),
    ...(graph ? [] : GRAPH_CAPABILITIES),
  ].map(entry => entry.label);
  return { level, available, unavailable, consequences: consequencesFor(level, jira, graph, permissions) };
}

/**
 * Converts the frozen union of `src/types.ts` ('granted' | 'missing' |
 * 'unknown') towards the local probed shape. Distinct name on purpose: the
 * two `GraphPermissionState` are not the same type.
 */
export function probeFromState(object: string, state: FrozenPermissionProbe): GraphPermissionState {
  if (state === 'granted') return { object, granted: true, probed: true };
  if (state === 'missing') return { object, granted: false, probed: true };
  return { object, granted: false, probed: false };
}

/** How much the minimum arm size widens at each level (SPEC §7 rule 2). */
const THRESHOLD_WIDENING: Readonly<Record<CapabilityLevel, number>> = {
  full: 1,
  'jira-only': 1.5,
  'declared-only': 2,
};

/**
 * Widens the minimum arm size so the app refuses to conclude where it no
 * longer has the material: ×1 in `full`, ×1.5 in `jira-only`, ×2 in
 * `declared-only` (SPEC §7 rule 2, SPEC §21). An unreadable threshold refuses
 * everything: `+Infinity`.
 */
export function widenThresholdForLevel(level: CapabilityLevel, baseThreshold: number): number {
  if (!Number.isFinite(baseThreshold)) return Number.POSITIVE_INFINITY;
  return Math.ceil(baseThreshold * THRESHOLD_WIDENING[level]);
}
