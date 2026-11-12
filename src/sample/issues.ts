/**
 * SPEC §13, §24 · DP-20, DP-22 — the families of the demo dataset.
 *
 * The dataset is generated from parameterized families instead of being copied
 * one by one (SPEC §24.1): each family declares its cohort, its two arms, its
 * failures and its window, and `builder.ts` spreads the tickets over it. The
 * families are chosen so the three sets of figures of SPEC §7 and §8 come out
 * exactly right:
 *
 * - `e2-green-bugfix-m`: 83 % on 41 tickets [69 ; 91] against 86 % on 37 [72 ; 94];
 * - `e2-red-migration-m`: the same nature, red: 40 % [22 ; 61] against 86 % [65 ; 95];
 * - `e3-orange-migration-m`: the card of PROJ-412 — 26 with agent, 31 without,
 *   69 % [50 ; 83] against 87 % [71 ; 95], 1,5 day against 3 days.
 *
 * The tickets the SPEC quotes by name keep their key: `PROJ-412` (the ticket the
 * video shows), `PROJ-207`, `PROJ-233` and `PROJ-301` (the tickets its advice
 * rests on), plus the showcase tickets of the guardrails (SPEC §8).
 *
 * No person appears here: only roles and robot accounts (SPEC §18, DP-17).
 */
import type { ClassifiedBy, Level, Nature, Size, Source, Zone } from '../types.js';
import { EPOCH_1, EPOCH_2, EPOCH_3 } from './epochs.js';

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
  /** True when the ticket carries a heavier review than the rest (SPEC §6). */
  readonly heavyReview: boolean;
  /** Place of the ticket inside its family arm: every derivation is stable. */
  readonly position: number;
}

/** One arm of a family: how many tickets, how many clean, which failures. */
export interface ArmPlan {
  readonly count: number;
  readonly clean: number;
  readonly medianH: number;
  readonly failures: FailurePlan;
  /** Source of the human arm; the agent arm cycles through the four (SPEC §5). */
  readonly source?: Source;
}

/** One open ticket of the demo, declared by hand (SPEC §8 guardrails). */
export interface OpenTicketSpec {
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
  readonly open: readonly OpenTicketSpec[];
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
}

/** A ticket the SPEC quotes by name: its key never moves (SPEC §24.1). */
export interface PinnedTicket {
  readonly key: string;
  readonly familyId: string;
  readonly arm: 'agent' | 'human';
  readonly position: number;
}

/* ------------------------------------------------------------------ helpers */

/** The arm of the agent: the three levels the team uses (SPEC §5). */
export const AGENT_LEVELS: readonly Level[] = ['assisted', 'driven', 'autonomous'];

/** The sources of the agent arm, safest first (SPEC §5 "Cinq sources"). */
export const AGENT_SOURCES: readonly Source[] = ['mcp-declaration', 'bot-author', 'commit-mention', 'closure-field'];

function arm(count: number, clean: number, medianH: number, failures: FailurePlan): ArmPlan {
  return { count, clean, medianH, failures };
}

function humanArm(count: number, clean: number, medianH: number, failures: FailurePlan, source: Source = 'closure-field'): ArmPlan {
  return { count, clean, medianH, failures, source };
}

/* ------------------------------------------------------------------ families */

/**
 * The families of the demo dataset.
 *
 * The figures are chosen so that the three sets of numbers of SPEC §7 and §8
 * come out exactly right, and so that the delegation map of SPEC §12 shows a
 * green cell (`e2-green-tests-web-m`), an orange one (`e2-orange-migration-pipeline-m`,
 * in a sensitive zone) and a red one (`e2-red-migration-m`).
 */
/** The open tickets the demo shows: the guardrails of SPEC §8, one by one. */
export const OPEN_SHOWCASE: readonly OpenTicketSpec[] = [
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

export const FAMILIES: readonly FamilyPlan[] = [
  {
    id: 'pre-adoption', epochId: EPOCH_1, nature: 'bugfix', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}),
    human: humanArm(9, 9, 30, {}, 'adoption-date'),
    unknown: 0, open: [], from: '2025-12-08', to: '2025-12-30',
    summary: 'Travail avant l\'adoption des agents / Work done before the agents were adopted',
    labels: ['before-adoption'],
  },
  {
    id: 'e1-bugfix-s', epochId: EPOCH_1, nature: 'bugfix', zone: 'api', size: 'S',
    agent: arm(5, 4, 26, { causedBugs: 1 }),
    human: humanArm(6, 6, 30, {}),
    unknown: 0, open: [], from: '2026-01-13', to: '2026-04-03',
    summary: 'Correction de la connexion / Connection fix',
  },
  {
    id: 'e1-ui-s', epochId: EPOCH_1, nature: 'ui-change', zone: 'web-ui', size: 'S',
    agent: arm(3, 3, 20, {}),
    human: humanArm(5, 4, 24, { causedBugs: 1 }),
    unknown: 0, open: [], from: '2026-01-20', to: '2026-03-27',
    summary: 'Ajustement de l\'affichage / Display tweak',
  },
  {
    id: 'e1-refactor-m', epochId: EPOCH_1, nature: 'refactor', zone: 'api', size: 'M',
    agent: arm(4, 3, 40, { reopened: 1 }),
    human: humanArm(2, 2, 44, {}),
    unknown: 0, open: [], from: '2026-02-02', to: '2026-04-02',
    summary: 'Nettoyage du module de facturation / Billing module cleanup',
  },
  {
    id: 'e1-tests-s', epochId: EPOCH_1, nature: 'tests', zone: 'api', size: 'S',
    agent: arm(2, 2, 12, {}),
    human: humanArm(3, 3, 14, {}),
    unknown: 0, open: [], from: '2026-02-10', to: '2026-03-20',
    summary: 'Tests de non-régression / Non-regression tests',
  },
  {
    id: 'e1-unknown-config', epochId: EPOCH_1, nature: 'configuration', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}), human: humanArm(0, 0, 0, {}),
    unknown: 30, open: [], from: '2026-01-13', to: '2026-04-03',
    summary: 'Réglages d\'exploitation / Operational settings', sizeEstimated: true,
  },
  {
    id: 'e2-green-bugfix-m', epochId: EPOCH_2, nature: 'bugfix', zone: 'api', size: 'M',
    agent: arm(41, 34, 30, { reopened: 2, causedBugs: 5, incidents: 1, takeover: 1 }),
    human: humanArm(37, 32, 44, { reopened: 1, causedBugs: 4, incidents: 1 }),
    unknown: 0, open: [], from: '2026-04-07', to: '2026-09-11',
    summary: 'Correction du parcours de commande / Checkout path fix',
  },
  {
    id: 'e2-green-tests-web-m', epochId: EPOCH_2, nature: 'tests', zone: 'web-ui', size: 'M',
    agent: arm(40, 34, 40, { reopened: 2, causedBugs: 4 }),
    human: humanArm(40, 24, 56, { reopened: 4, causedBugs: 12, incidents: 2 }),
    unknown: 0, open: [], from: '2026-05-05', to: '2026-09-09',
    summary: 'Tests du parcours de paiement / Payment path tests', sizeEstimated: true,
  },
  {
    id: 'e2-red-migration-m', epochId: EPOCH_2, nature: 'data-migration', zone: 'billing', size: 'M',
    agent: arm(20, 8, 36, { reopened: 5, causedBugs: 7, incidents: 3 }),
    human: humanArm(21, 18, 72, { causedBugs: 3, incidents: 1 }),
    unknown: 0, open: [], from: '2026-04-08', to: '2026-09-12',
    summary: 'Migration du champ « montant » en centimes / Migration of the amount field to cents',
    labels: ['migration'], heavyReview: true,
  },
  {
    id: 'e2-orange-migration-pipeline-m', epochId: EPOCH_2, nature: 'data-migration', zone: 'data-pipeline', size: 'M',
    agent: arm(36, 30, 32, { reopened: 2, causedBugs: 4 }),
    human: humanArm(34, 20, 60, { reopened: 4, causedBugs: 10, incidents: 1 }),
    unknown: 0, open: [], from: '2026-05-12', to: '2026-09-10',
    summary: 'Migration du schéma de reprise / Backup schema migration',
    labels: ['migration', 'sensitive'], heavyReview: true,
  },
  {
    id: 'e2-unbalanced-ext-l', epochId: EPOCH_2, nature: 'external-integration', zone: 'api', size: 'L',
    agent: arm(22, 19, 60, { reopened: 1, causedBugs: 2 }),
    human: humanArm(3, 2, 96, { causedBugs: 1, incidents: 1 }),
    unknown: 0, open: [], from: '2026-04-13', to: '2026-09-10',
    summary: 'Raccordement du transporteur / Shipping provider hookup',
  },
  {
    id: 'e2-sensitive-pipeline-s', epochId: EPOCH_2, nature: 'data-migration', zone: 'data-pipeline', size: 'S',
    agent: arm(12, 9, 28, { causedBugs: 3, incidents: 1 }),
    human: humanArm(6, 4, 52, { reopened: 1, causedBugs: 1 }),
    unknown: 0, open: [], from: '2026-05-04', to: '2026-09-04',
    summary: 'Reprise du pipeline de reprise / Backup pipeline rework',
    labels: ['sensitive'], heavyReview: true,
  },
  {
    id: 'e2-grey-ui-l', epochId: EPOCH_2, nature: 'ui-change', zone: 'web-ui', size: 'L',
    agent: arm(3, 3, 22, {}),
    human: humanArm(4, 3, 26, { causedBugs: 1 }),
    unknown: 0, open: [], from: '2026-05-11', to: '2026-09-04',
    summary: 'Refonte de l\'historique / History screen rework',
  },
  {
    id: 'e2-grey-refactor-l', epochId: EPOCH_2, nature: 'refactor', zone: 'api', size: 'L',
    agent: arm(4, 4, 34, {}),
    human: humanArm(5, 4, 38, { causedBugs: 1 }),
    unknown: 0, open: [], from: '2026-05-18', to: '2026-09-04',
    summary: 'Extraction du module de facturation / Billing module extraction',
  },
  {
    id: 'e2-grey-tests-s', epochId: EPOCH_2, nature: 'tests', zone: 'api', size: 'S',
    agent: arm(4, 4, 10, {}),
    human: humanArm(4, 3, 12, { causedBugs: 1 }),
    unknown: 0, open: [], from: '2026-06-01', to: '2026-09-04',
    summary: 'Tests du plan de migration / Migration plan tests',
  },
  {
    id: 'e2-trial-ext-m', epochId: EPOCH_2, nature: 'external-integration', zone: 'api', size: 'M',
    agent: arm(5, 4, 48, { causedBugs: 1 }),
    human: humanArm(4, 3, 56, { causedBugs: 1, incidents: 1 }),
    unknown: 0, open: [], from: '2026-06-08', to: '2026-09-04',
    summary: 'Raccordement du service de signature / Signature service hookup',
    classifiedBy: 'model', sizeEstimated: true, description: 'none',
  },
  {
    id: 'e2-grey-ext-s', epochId: EPOCH_2, nature: 'external-integration', zone: 'api', size: 'S',
    agent: arm(4, 3, 40, { causedBugs: 1 }),
    human: humanArm(3, 3, 44, {}),
    unknown: 0, open: [], from: '2026-06-15', to: '2026-09-04',
    summary: 'Ajustement du connecteur / Connector tweak',
  },
  {
    id: 'e2-unknown-config', epochId: EPOCH_2, nature: 'configuration', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}), human: humanArm(0, 0, 0, {}),
    unknown: 215, open: [], from: '2026-04-06', to: '2026-09-13',
    summary: 'Réglages d\'exploitation / Operational settings', sizeEstimated: true,
  },
  {
    id: 'e2-unknown-refactor-web', epochId: EPOCH_2, nature: 'refactor', zone: 'web-ui', size: 'M',
    agent: arm(0, 0, 0, {}), human: humanArm(0, 0, 0, {}),
    unknown: 53, open: [], from: '2026-04-20', to: '2026-09-13',
    summary: 'Reprise de l\'interface / Interface rework', sizeEstimated: true,
  },
  {
    id: 'e3-orange-migration-m', epochId: EPOCH_3, nature: 'data-migration', zone: 'billing', size: 'M',
    agent: arm(26, 18, 36, { reopened: 5, causedBugs: 3, takeover: 1 }),
    human: humanArm(31, 27, 72, { causedBugs: 4, incidents: 1 }),
    unknown: 0, open: [], from: '2026-09-16', to: '2026-09-30',
    summary: 'Migration du champ « montant » en centimes / Migration of the amount field to cents',
    labels: ['migration'], heavyReview: true,
  },
  {
    id: 'e3-bugfix-m', epochId: EPOCH_3, nature: 'bugfix', zone: 'api', size: 'M',
    agent: arm(18, 15, 26, { causedBugs: 3, incidents: 1 }),
    human: humanArm(16, 14, 38, { reopened: 1, causedBugs: 1 }),
    unknown: 0, open: [], from: '2026-09-16', to: '2026-09-30',
    summary: 'Correction du panier / Cart fix',
  },
  {
    id: 'e3-trial-ext-m', epochId: EPOCH_3, nature: 'external-integration', zone: 'api', size: 'M',
    agent: arm(5, 4, 50, { causedBugs: 1 }),
    human: humanArm(5, 4, 58, { causedBugs: 1, incidents: 1 }),
    unknown: 0, open: [], from: '2026-10-05', to: '2026-10-19',
    summary: 'Raccordement du service de signature / Signature service hookup',
    classifiedBy: 'model', sizeEstimated: true, labels: ['trial'],
  },
  {
    id: 'e3-ui-s', epochId: EPOCH_3, nature: 'ui-change', zone: 'web-ui', size: 'S',
    agent: arm(7, 6, 18, { causedBugs: 1, incidents: 1 }),
    human: humanArm(5, 4, 22, { causedBugs: 1 }),
    unknown: 0, open: [], from: '2026-10-08', to: '2026-11-28',
    summary: 'Affichage du reçu / Receipt display',
  },
  {
    id: 'e3-nocode', epochId: EPOCH_3, nature: 'no-code', zone: 'api', size: 'S',
    agent: arm(2, 2, 6, {}),
    human: humanArm(3, 2, 8, { causedBugs: 1 }),
    unknown: 2, open: [], from: '2026-10-12', to: '2026-11-12',
    summary: 'Documentation du module / Module documentation', labels: ['documentation'],
  },
  {
    id: 'e3-unknown-config', epochId: EPOCH_3, nature: 'configuration', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}), human: humanArm(0, 0, 0, {}),
    unknown: 38, open: [], from: '2026-09-14', to: '2026-11-20',
    summary: 'Réglages d\'exploitation / Operational settings', sizeEstimated: true,
  },
  {
    id: 'e3-unknown-ui-web', epochId: EPOCH_3, nature: 'ui-change', zone: 'web-ui', size: 'S',
    agent: arm(0, 0, 0, {}), human: humanArm(0, 0, 0, {}),
    unknown: 18, open: [], from: '2026-09-20', to: '2026-11-25',
    summary: 'Retouche de l\'interface / Interface polish', sizeEstimated: true,
  },
  {
    id: 'e3-caused-bugs', epochId: EPOCH_3, nature: 'bugfix', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}), human: humanArm(0, 0, 0, {}),
    unknown: 12, open: [], from: '2026-11-02', to: '2026-11-27',
    summary: 'Bugs signalés après la livraison / Bugs reported after the release', labels: ['bug'],
  },
  {
    id: 'e3-showcase', epochId: EPOCH_3, nature: 'external-integration', zone: 'api', size: 'M',
    agent: arm(0, 0, 0, {}), human: humanArm(0, 0, 0, {}),
    unknown: 0, open: OPEN_SHOWCASE, from: '2026-11-01', to: '2026-11-28',
    summary: 'Tickets ouverts de la démonstration / Open tickets of the demo',
  },
];

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

/** The tickets the SPEC quotes by name: their key never moves (SPEC §24.1). */
export const SAMPLE_PINS: readonly PinnedTicket[] = [
  { key: 'PROJ-412', familyId: 'e3-orange-migration-m', arm: 'agent', position: 0 },
  { key: 'PROJ-301', familyId: 'e3-orange-migration-m', arm: 'agent', position: 1 },
  { key: 'PROJ-207', familyId: 'e3-orange-migration-m', arm: 'human', position: 0 },
  { key: 'PROJ-233', familyId: 'e3-orange-migration-m', arm: 'human', position: 1 },
  { key: 'PROJ-459', familyId: 'e3-nocode', arm: 'human', position: 0 },
];
