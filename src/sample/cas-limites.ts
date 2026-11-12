/**
 * SPEC §21, §22 · DP-20 — the edge cases of the demo dataset, by name.
 *
 * Every behaviour the product must show has one named ticket that shows it:
 * the card of the SPEC, the guardrails, the administrative reopening, the
 * neighbour bug, the ticket moved to another project, the controlled trial.
 * The keys never move (SPEC §24.1), and the base is built around them: a
 * scenario ticket is built by the same constructor as any other ticket, only
 * its parameters change (zero duplication).
 *
 * The file is read by `builder.ts` (the adjustments), by `outcomes.ts` (the
 * links) and by the tests (`cas-limites.test.ts`).
 */
import type { Level, Nature, Size, Source, Zone } from '../types.js';
import type { SeedFailure } from './issues.js';

/** The group of a family a named ticket sits in. */
export type CasGroup = 'agent' | 'human' | 'unknown';

/** One link a named ticket carries (SPEC §6 "Liens"). */
export interface CasLink {
  /** The key of the linked ticket. */
  readonly to: string;
  readonly type: 'caused-by' | 'relates-to';
  readonly linkedIsIncident: boolean;
  readonly linkedIsBug: boolean;
}

/** What a named ticket changes, compared with an ordinary ticket of its arm. */
export interface SeedAdjust {
  readonly level?: Level;
  readonly source?: Source;
  readonly nature?: Nature;
  readonly zone?: Zone;
  readonly size?: Size;
  readonly summary?: string;
  readonly hasDescription?: boolean;
  readonly commits?: number;
  readonly createdAt?: string;
  readonly closedAt?: string;
  readonly leadTimeH?: number;
  /** The failure of the ticket, merged over the one the arm hands out. */
  readonly failure?: Partial<SeedFailure>;
  readonly reopenedAt?: string;
  readonly reopenDurationMin?: number;
  readonly neighborBugs?: number;
  /** Number of signed commits when the ticket mixes signed and unsigned ones. */
  readonly signedCommits?: number;
  /** The project the ticket came from when it was moved (SPEC §17). */
  readonly movedFromProject?: string;
  /** The state of the controlled trial for this ticket (SPEC §11). */
  readonly trial?: '' | 'in-trial' | 'left-trial';
  readonly trialReason?: string;
  readonly links?: readonly CasLink[];
}

/** One named ticket of the base, and the case it demonstrates. */
export interface CasLimite {
  /** The key of the ticket: it never moves (SPEC §24.1). */
  readonly key: string;
  /** The case the ticket demonstrates, in the words of the SPEC. */
  readonly cas: string;
  /** The family the ticket lives in. */
  readonly familyId: string;
  /** The group of the family the ticket sits in. */
  readonly group: CasGroup;
  /** Its place in the group: the generator puts it there. */
  readonly position: number;
  /** What it changes, compared with an ordinary ticket. */
  readonly adjust: SeedAdjust;
  /** True for the past tickets the advice of the SPEC card rests on. */
  readonly reference?: boolean;
}

/** One open ticket of the demo, declared by hand (SPEC §8 guardrails). */
export interface OpenShowcase {
  readonly key: string;
  readonly summary: string;
  readonly nature: Nature;
  readonly zone: Zone;
  readonly size: Size;
  readonly level: Level;
  readonly source: Source;
  readonly createdAt: string;
  readonly acceptance: boolean;
  readonly commits: number;
  readonly incidents: number;
  readonly linkedIssueKey: string;
}

/** The 18 named cases of SPEC §21 and §22, one ticket each. */
export const CAS_LIMITES: readonly CasLimite[] = [
  {
    key: 'PROJ-118', cas: 'clos avant la date d\'adoption : bras « sans agent »',
    familyId: 'pre-adoption', group: 'human', position: 0, adjust: {},
  },
  {
    key: 'PROJ-412', cas: 'la carte du SPEC §8 : 26 avec agent, 31 sans',
    familyId: 'e3-orange-migration-m', group: 'agent', position: 0, adjust: {},
  },
  {
    key: 'PROJ-509', cas: 'lié à un incident ouvert : garde-fou, jamais « à confier »',
    familyId: 'e2-scenario-bugfix-api-s', group: 'agent', position: 5,
    adjust: {
      level: 'driven', source: 'mcp-declaration',
      links: [{ to: 'PROJ-456', type: 'relates-to', linkedIsIncident: true, linkedIsBug: false }],
    },
  },
  {
    key: 'PROJ-517', cas: 'en zone sensible : garde-fou',
    familyId: 'e2-scenario-ui-data-m', group: 'agent', position: 3,
    adjust: { level: 'driven', source: 'mcp-declaration' },
  },
  {
    key: 'PROJ-523', cas: 'sans critères d\'acceptation : garde-fou',
    familyId: 'e2-scenario-tests-web-m', group: 'agent', position: 2,
    adjust: { level: 'assisted', source: 'closure-field', hasDescription: false },
  },
  {
    key: 'PROJ-531', cas: 'commits mêlés, signés et non signés : niveau assisted',
    familyId: 'e2-scenario-bugfix-api-s', group: 'agent', position: 7,
    adjust: { level: 'assisted', source: 'commit-mention', commits: 2, signedCommits: 1 },
  },
  {
    key: 'PROJ-540', cas: 'agent muet : ni signature ni déclaration, donc inconnu',
    familyId: 'e2-unknown-tests-web', group: 'unknown', position: 0, adjust: {},
  },
  {
    key: 'PROJ-548', cas: 'réouverture administrative de 8 minutes : écartée',
    familyId: 'e2-scenario-refactor-billing-l', group: 'human', position: 3,
    adjust: { reopenDurationMin: 8 },
  },
  {
    key: 'PROJ-555', cas: 'bug voisin : signal faible, hors de la clôture propre',
    familyId: 'e2-scenario-tests-web-m', group: 'human', position: 4,
    adjust: { neighborBugs: 1 },
  },
  {
    key: 'PROJ-562', cas: 'bug relié par « est causé par » : pas une clôture propre',
    familyId: 'e2-scenario-bugfix-api-s', group: 'human', position: 50,
    adjust: { failure: { causedBugs: 1 } },
  },
  {
    key: 'PROJ-571', cas: 'rouvert sous 30 jours : pas une clôture propre',
    familyId: 'e2-scenario-refactor-billing-l', group: 'agent', position: 20,
    adjust: { failure: { reopened: true } },
  },
  {
    key: 'PROJ-611', cas: 'déplacé de projet : il change de cohorte, pas de résultat',
    familyId: 'e2-scenario-refactor-api-m', group: 'human', position: 6,
    adjust: { movedFromProject: 'proj-other-002' },
  },
  {
    key: 'PROJ-701', cas: 'dans l\'essai contrôlé, tirage respecté : il y reste',
    familyId: 'e3-trial-ext-m', group: 'human', position: 0,
    adjust: { trial: 'in-trial' },
  },
  {
    key: 'PROJ-706', cas: 'dans l\'essai, tirage non respecté : il en sort avec le motif',
    familyId: 'e3-trial-ext-m', group: 'human', position: 1,
    adjust: { trial: 'left-trial' },
  },
  {
    key: 'PROJ-812', cas: 'reprise humaine déclarée : aucun nom de personne',
    familyId: 'e2-scenario-integration-billing-m', group: 'agent', position: 34,
    adjust: { failure: { takeover: true } },
  },
  {
    key: 'PROJ-820', cas: 'abandonné après démarrage',
    familyId: 'e2-scenario-refactor-billing-l', group: 'human', position: 31,
    adjust: { failure: { abandoned: true } },
  },
  {
    key: 'PROJ-902', cas: 'clos il y a 10 jours : pas encore mûr',
    familyId: 'e2-scenario-bugfix-api-s', group: 'human', position: 10,
    adjust: { closedAt: '2026-11-20T12:00:00Z' },
  },
  {
    key: 'PROJ-950', cas: 'sans commit (documentation) : nature à part',
    familyId: 'e3-nocode', group: 'human', position: 1,
    adjust: { commits: 0 },
  },
  {
    key: 'PROJ-207', cas: 'ticket de référence de la carte du SPEC §8 (bras humain)',
    familyId: 'e3-orange-migration-m', group: 'human', position: 0,
    adjust: {}, reference: true,
  },
  {
    key: 'PROJ-233', cas: 'ticket de référence de la carte du SPEC §8 (bras humain)',
    familyId: 'e3-orange-migration-m', group: 'human', position: 1,
    adjust: {}, reference: true,
  },
  {
    key: 'PROJ-301', cas: 'ticket de référence de la carte du SPEC §8 (bras agent)',
    familyId: 'e3-orange-migration-m', group: 'agent', position: 1,
    adjust: {}, reference: true,
  },
  {
    key: 'PROJ-459', cas: 'ticket sans commit : hors des cohortes de code',
    familyId: 'e3-nocode', group: 'human', position: 0,
    adjust: { commits: 0 },
  },
];

/** The open tickets the demo shows: the guardrails of SPEC §8, one by one. */
export const OPEN_SHOWCASE: readonly OpenShowcase[] = [
  {
    key: 'PROJ-455', summary: 'Reprise des factures en devise étrangère',
    nature: 'data-migration', zone: 'billing', size: 'M', level: 'driven', source: 'mcp-declaration',
    createdAt: '2026-11-16T09:00:00Z', acceptance: true, commits: 2, incidents: 1, linkedIssueKey: 'PROJ-456',
  },
  {
    key: 'PROJ-456', summary: 'Incident ouvert — facturation des abonnements',
    nature: 'bugfix', zone: 'api', size: 'S', level: 'unknown', source: 'adoption-date',
    createdAt: '2026-11-18T08:00:00Z', acceptance: true, commits: 0, incidents: 0, linkedIssueKey: '',
  },
  {
    key: 'PROJ-457', summary: 'Reprise du pipeline de reprise',
    nature: 'data-migration', zone: 'data-pipeline', size: 'S', level: 'driven', source: 'mcp-declaration',
    createdAt: '2026-11-19T10:00:00Z', acceptance: true, commits: 1, incidents: 0, linkedIssueKey: '',
  },
  {
    key: 'PROJ-458', summary: 'Bandeau de démonstration du projet',
    nature: 'ui-change', zone: 'web-ui', size: 'S', level: 'assisted', source: 'bot-author',
    createdAt: '2026-11-20T11:00:00Z', acceptance: false, commits: 1, incidents: 0, linkedIssueKey: '',
  },
  {
    key: 'PROJ-460', summary: 'Extraction du module de relance — essai contrôlé',
    nature: 'external-integration', zone: 'api', size: 'M', level: 'driven', source: 'mcp-declaration',
    createdAt: '2026-11-23T09:00:00Z', acceptance: true, commits: 1, incidents: 0, linkedIssueKey: '',
  },
];

/** The named ticket of one key, when the base declares one. */
export function casLimiteOf(key: string): CasLimite | undefined {
  return CAS_LIMITES.find((cas) => cas.key === key);
}

/** The named ticket that sits at one place of one family, when there is one. */
export function casLimiteAt(
  familyId: string,
  group: CasGroup,
  position: number,
): CasLimite | undefined {
  return CAS_LIMITES.find(
    (cas) => cas.familyId === familyId && cas.group === group && cas.position === position,
  );
}

/** Every named ticket of the base, by key. */
export const CAS_BY_KEY: Readonly<Record<string, CasLimite>> = Object.fromEntries(
  CAS_LIMITES.map((cas) => [cas.key, cas]),
);
