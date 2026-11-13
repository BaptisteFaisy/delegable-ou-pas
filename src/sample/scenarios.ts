/**
 * SPEC §13, §24 · DP-20, DP-22 — the scenario table of the demo dataset.
 *
 * The demo is not drawn at random: every cohort of the base is a *named*
 * scenario, with its two arms, its clean closures, its median delays, its
 * censored tickets and the edge cases it carries. This file is the single
 * source of truth: `issues.ts` turns the scenarios into families, `builder.ts`
 * unfolds them, and the tests read the figures back from the game.
 *
 * The ten scenarios of the brief are `SCENARIOS`; `FILLERS` carry the material
 * the product needs around them (the cohorts quoted by the SPEC, the tickets
 * whose involvement could not be read, the bug family the links point to, the
 * trial cohort). Both lists are read by the same generator.
 *
 * Vocabulary of the brief, mapped on the zones and natures of the project
 * (`src/sample/project.ts`): `front` is `web-ui`, `data` is `data-pipeline`,
 * `infra` is `api`, `config` is `configuration`, `integration` is
 * `external-integration`.
 */
import type { Source } from '../types.js';
import type { ArmPlan, FailurePlan, FamilyPlan } from './issues.js';
import { EPOCH_1, EPOCH_2, EPOCH_3 } from './epochs.js';
import { OPEN_SHOWCASE } from './cas-limites.js';

/** One scenario of the table: a family, plus what it demonstrates. */
export interface Scenario extends FamilyPlan {
  /** What the scenario shows on screen (SPEC §8, §12, §22). */
  readonly demonstrates: string;
}

/** The arm of an agent: how many tickets, how many clean, which failures. */
function arm(
  count: number,
  clean: number,
  medianH: number,
  failures: FailurePlan,
  open = 0,
): ArmPlan {
  return { count, clean, medianH, failures, open };
}

/** The arm of a human: the same, with the source the team declares. */
function humanArm(
  count: number,
  clean: number,
  medianH: number,
  failures: FailurePlan,
  open = 0,
  source: Source = 'closure-field',
): ArmPlan {
  return { count, clean, medianH, failures, open, source };
}

/* ------------------------------------------------------------------ scenarios */

/**
 * The ten scenarios of the brief (SPEC §8, §12, §21, §22).
 *
 * The figures are the ones the brief quotes, to the digit: two arms, their
 * clean closures, their median delays, the censored tickets and the failures.
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'e3-orange-migration-m', epochId: EPOCH_3, nature: 'data-migration', zone: 'billing', size: 'M',
    agent: arm(26, 18, 36, { reopened: 5, causedBugs: 3, takeover: 1 }, 2),
    human: humanArm(31, 27, 72, { causedBugs: 4, incidents: 1 }, 2),
    unknown: 0, open: [], from: '2026-09-16', to: '2026-09-30',
    summary: 'Migration du champ « montant » en centimes / Migration of the amount field to cents',
    labels: ['migration'], heavyReview: true,
    demonstrates: 'la carte du SPEC §8 : 26 avec agent, 31 sans, 69 % contre 87 %, 1,5 jour contre 3 jours',
  },
  {
    id: 'e2-scenario-bugfix-api-s', epochId: EPOCH_2, nature: 'bugfix', zone: 'api', size: 'S',
    agent: arm(60, 55, 30, { causedBugs: 5 }, 4),
    human: humanArm(55, 47, 40, { reopened: 3, causedBugs: 5 }, 4),
    unknown: 0, open: [], from: '2026-04-13', to: '2026-08-28',
    summary: 'Correction des parcours de commande / Checkout path fixes',
    demonstrates: 'clôture propre équivalente, délai meilleur avec agent',
  },
  {
    id: 'e2-scenario-tests-web-m', epochId: EPOCH_2, nature: 'tests', zone: 'web-ui', size: 'M',
    agent: arm(48, 44, 40, { causedBugs: 4 }, 3),
    human: humanArm(42, 38, 52, { reopened: 2, causedBugs: 2 }, 3),
    unknown: 0, open: [], from: '2026-05-04', to: '2026-09-04',
    summary: 'Tests du parcours de paiement / Payment path tests',
    sizeEstimated: true,
    demonstrates: 'les tests écrits avec l\'agent se ferment aussi bien, et plus vite',
  },
  {
    id: 'e2-scenario-refactor-billing-l', epochId: EPOCH_2, nature: 'refactor', zone: 'billing', size: 'L',
    agent: arm(30, 15, 44, { reopened: 4, causedBugs: 11 }, 2),
    human: humanArm(35, 29, 48, { causedBugs: 6 }, 2),
    unknown: 0, open: [], from: '2026-04-20', to: '2026-09-04',
    summary: 'Reprise du module de facturation / Billing module rework',
    demonstrates: 'écart établi en défaveur des agents : à garder pour un humain',
  },
  {
    id: 'e2-scenario-ui-data-m', epochId: EPOCH_2, nature: 'ui-change', zone: 'data-pipeline', size: 'M',
    agent: arm(34, 22, 28, { reopened: 3, causedBugs: 9 }, 3),
    human: humanArm(30, 24, 44, { causedBugs: 6 }, 3),
    unknown: 0, open: [], from: '2026-05-11', to: '2026-09-04',
    summary: 'Retouche de l\'interface de reprise / Rework interface polish',
    labels: ['sensitive'],
    demonstrates: 'délai nettement meilleur avec agent, mais clôture propre en retrait',
  },
  {
    id: 'e2-scenario-config-api-s', epochId: EPOCH_2, nature: 'configuration', zone: 'api', size: 'S',
    agent: arm(8, 6, 20, { causedBugs: 2 }, 1),
    human: humanArm(6, 5, 26, { causedBugs: 1 }, 1),
    unknown: 0, open: [], from: '2026-05-18', to: '2026-09-04',
    summary: 'Réglages d\'exploitation / Operational settings',
    sizeEstimated: true,
    demonstrates: 'effectif sous le seuil : le gris honnête, jamais un chiffre seul',
  },
  {
    id: 'e2-scenario-integration-billing-m', epochId: EPOCH_2, nature: 'external-integration', zone: 'billing', size: 'M',
    agent: arm(40, 32, 60, { reopened: 2, causedBugs: 6 }, 3),
    human: humanArm(12, 8, 96, { causedBugs: 4 }, 1),
    unknown: 0, open: [], from: '2026-06-08', to: '2026-09-04',
    summary: 'Raccordement du service de facturation / Billing service hookup',
    demonstrates: 'bras déséquilibrés : le volume gap dépasse la tolérance, l\'app ne conclut pas',
  },
  {
    id: 'e2-simpson-easy-bugfix-web-m', epochId: EPOCH_2, nature: 'bugfix', zone: 'web-ui', size: 'M',
    agent: arm(285, 283, 18, { causedBugs: 2 }, 8),
    human: humanArm(50, 50, 20, {}, 2),
    unknown: 0, open: [], from: '2026-04-13', to: '2026-09-04',
    summary: 'Corrections faciles de l\'interface / Easy interface fixes',
    demonstrates: 'le paradoxe de Simpson, cohorte facile : presque tout le bras agent',
  },
  {
    id: 'e2-simpson-middle-tests-data-m', epochId: EPOCH_2, nature: 'tests', zone: 'data-pipeline', size: 'M',
    agent: arm(30, 18, 40, { reopened: 2, causedBugs: 10 }, 2),
    human: humanArm(30, 27, 44, { causedBugs: 3 }, 2),
    unknown: 0, open: [], from: '2026-04-20', to: '2026-09-04',
    summary: 'Tests du pipeline de reprise / Backup pipeline tests',
    sizeEstimated: true,
    demonstrates: 'le paradoxe de Simpson, cohorte médiane : les deux bras se suivent',
  },
  {
    id: 'e2-simpson-hard-refactor-data-l', epochId: EPOCH_2, nature: 'refactor', zone: 'data-pipeline', size: 'L',
    agent: arm(20, 4, 60, { reopened: 1, causedBugs: 15 }, 1),
    human: humanArm(190, 152, 64, { reopened: 4, causedBugs: 34 }, 6),
    unknown: 0, open: [], from: '2026-04-27', to: '2026-09-04',
    summary: 'Reprise lourde du pipeline / Heavy pipeline rework',
    demonstrates: 'le paradoxe de Simpson, cohorte difficile : presque tout le bras human',
  },
  {
    id: 'e2-scenario-refactor-api-m', epochId: EPOCH_2, nature: 'refactor', zone: 'api', size: 'M',
    agent: arm(22, 18, 40, { causedBugs: 4 }, 2),
    human: humanArm(24, 20, 44, { causedBugs: 4 }, 2),
    unknown: 0, open: [], from: '2026-05-25', to: '2026-09-04',
    summary: 'Reprise du module d\'intégration / Integration module rework',
    roles: ['dev-1', 'dev-2'],
    demonstrates: 'cohorte portée par deux personnes seulement : elle est masquée',
  },
  {
    id: 'e3-scenario-bugfix-web-s', epochId: EPOCH_3, nature: 'bugfix', zone: 'web-ui', size: 'S',
    agent: arm(29, 25, 22, { causedBugs: 4 }, 16),
    human: humanArm(28, 24, 26, { reopened: 1, causedBugs: 3 }, 12),
    unknown: 0, open: [], from: '2026-10-05', to: '2026-11-25',
    summary: 'Corrections du parcours d\'achat / Checkout path fixes',
    demonstrates: 'de l\'analyse de survie : des tickets censurés, des médianes atteintes et non atteintes',
  },
];

/* -------------------------------------------------------------------- fillers */

/**
 * The material around the scenarios: the cohorts the SPEC quotes, the tickets
 * whose involvement could not be read, the bug family the links point to, the
 * cohort of the controlled trial.
 */
export const FILLERS: readonly Scenario[] = [
  {
    id: 'pre-adoption', epochId: EPOCH_1, nature: 'bugfix', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}),
    human: humanArm(9, 9, 30, {}, 0, 'adoption-date'),
    unknown: 0, open: [], from: '2025-12-08', to: '2025-12-30',
    summary: 'Travail avant l\'adoption des agents / Work done before the agents were adopted',
    labels: ['before-adoption'],
    demonstrates: 'avant la date d\'adoption, tout est « sans agent »',
  },
  {
    id: 'e1-bugfix-s', epochId: EPOCH_1, nature: 'bugfix', zone: 'api', size: 'S',
    agent: arm(5, 4, 26, { causedBugs: 1 }),
    human: humanArm(6, 6, 30, {}),
    unknown: 0, open: [], from: '2026-01-13', to: '2026-04-03',
    summary: 'Correction de la connexion / Connection fix',
    demonstrates: 'les premiers mois de l\'époque 1',
  },
  {
    id: 'e1-ui-s', epochId: EPOCH_1, nature: 'ui-change', zone: 'web-ui', size: 'S',
    agent: arm(3, 3, 20, {}),
    human: humanArm(5, 4, 24, { causedBugs: 1 }),
    unknown: 0, open: [], from: '2026-01-20', to: '2026-03-27',
    summary: 'Ajustement de l\'affichage / Display tweak',
    demonstrates: 'les premiers mois de l\'époque 1',
  },
  {
    id: 'e1-refactor-m', epochId: EPOCH_1, nature: 'refactor', zone: 'api', size: 'M',
    agent: arm(4, 3, 40, { reopened: 1 }),
    human: humanArm(2, 2, 44, {}),
    unknown: 0, open: [], from: '2026-02-02', to: '2026-04-02',
    summary: 'Nettoyage du module de facturation / Billing module cleanup',
    demonstrates: 'les premiers mois de l\'époque 1',
  },
  {
    id: 'e1-tests-s', epochId: EPOCH_1, nature: 'tests', zone: 'api', size: 'S',
    agent: arm(2, 2, 12, {}),
    human: humanArm(3, 3, 14, {}),
    unknown: 0, open: [], from: '2026-02-10', to: '2026-03-20',
    summary: 'Tests de non-régression / Non-regression tests',
    demonstrates: 'les premiers mois de l\'époque 1',
  },
  {
    id: 'e2-green-bugfix-m', epochId: EPOCH_2, nature: 'bugfix', zone: 'api', size: 'M',
    agent: arm(41, 34, 30, { reopened: 2, causedBugs: 5, incidents: 1, takeover: 1 }, 2),
    human: humanArm(37, 32, 44, { reopened: 1, causedBugs: 4, incidents: 1 }, 2),
    unknown: 0, open: [], from: '2026-04-07', to: '2026-09-11',
    summary: 'Correction du parcours de commande / Checkout path fix',
    demonstrates: 'le couple de chiffres du SPEC §7 : 83 % sur 41 contre 86 % sur 37',
  },
  {
    id: 'e2-green-tests-web-m', epochId: EPOCH_2, nature: 'tests', zone: 'web-ui', size: 'M',
    agent: arm(40, 34, 40, { reopened: 2, causedBugs: 4 }, 2),
    human: humanArm(40, 24, 56, { reopened: 4, causedBugs: 12, incidents: 2 }, 2),
    unknown: 0, open: [], from: '2026-05-05', to: '2026-09-09',
    summary: 'Tests du parcours de paiement / Payment path tests',
    sizeEstimated: true,
    demonstrates: 'la case verte : écart établi en faveur des agents',
  },
  {
    id: 'e2-red-migration-m', epochId: EPOCH_2, nature: 'data-migration', zone: 'billing', size: 'M',
    agent: arm(20, 8, 36, { reopened: 5, causedBugs: 7, incidents: 3 }, 2),
    human: humanArm(21, 18, 72, { causedBugs: 3, incidents: 1 }, 1),
    unknown: 0, open: [], from: '2026-04-08', to: '2026-09-12',
    summary: 'Migration du champ « montant » en centimes / Migration of the amount field to cents',
    labels: ['migration'], heavyReview: true,
    demonstrates: 'la case rouge : écart établi en défaveur des agents',
  },
  {
    id: 'e2-orange-migration-pipeline-m', epochId: EPOCH_2, nature: 'data-migration', zone: 'data-pipeline', size: 'M',
    agent: arm(36, 30, 32, { reopened: 2, causedBugs: 4 }, 2),
    human: humanArm(34, 20, 60, { reopened: 4, causedBugs: 10, incidents: 1 }, 2),
    unknown: 0, open: [], from: '2026-05-12', to: '2026-09-10',
    summary: 'Migration du schéma de reprise / Backup schema migration',
    labels: ['migration', 'sensitive'], heavyReview: true,
    demonstrates: 'la case orange : bon écart, mais zone sensible',
  },
  {
    id: 'e2-unbalanced-ext-l', epochId: EPOCH_2, nature: 'external-integration', zone: 'api', size: 'L',
    agent: arm(22, 19, 60, { reopened: 1, causedBugs: 2 }, 1),
    human: humanArm(3, 2, 96, { causedBugs: 1, incidents: 1 }, 0),
    unknown: 0, open: [], from: '2026-04-13', to: '2026-09-10',
    summary: 'Raccordement du transporteur / Shipping provider hookup',
    demonstrates: 'les bras déséquilibrés du SPEC §7 : 22 contre 3',
  },
  {
    id: 'e2-sensitive-pipeline-s', epochId: EPOCH_2, nature: 'data-migration', zone: 'data-pipeline', size: 'S',
    agent: arm(12, 9, 28, { causedBugs: 3, incidents: 1 }, 1),
    human: humanArm(6, 4, 52, { reopened: 1, causedBugs: 1 }, 1),
    unknown: 0, open: [], from: '2026-05-04', to: '2026-09-04',
    summary: 'Reprise du pipeline de reprise / Backup pipeline rework',
    labels: ['sensitive'], heavyReview: true,
    demonstrates: 'une zone sensible, sous le seuil : le gris honnête',
  },
  {
    id: 'e2-grey-ui-l', epochId: EPOCH_2, nature: 'ui-change', zone: 'web-ui', size: 'L',
    agent: arm(3, 3, 22, {}),
    human: humanArm(4, 3, 26, { causedBugs: 1 }, 1),
    unknown: 0, open: [], from: '2026-05-11', to: '2026-09-04',
    summary: 'Refonte de l\'historique / History screen rework',
    demonstrates: 'une cohorte trop petite pour conclure',
  },
  {
    id: 'e2-grey-refactor-l', epochId: EPOCH_2, nature: 'refactor', zone: 'api', size: 'L',
    agent: arm(4, 4, 34, {}),
    human: humanArm(5, 4, 38, { causedBugs: 1 }, 1),
    unknown: 0, open: [], from: '2026-05-18', to: '2026-09-04',
    summary: 'Extraction du module de facturation / Billing module extraction',
    demonstrates: 'une cohorte trop petite pour conclure',
  },
  {
    id: 'e2-grey-tests-s', epochId: EPOCH_2, nature: 'tests', zone: 'api', size: 'S',
    agent: arm(4, 4, 10, {}),
    human: humanArm(4, 3, 12, { causedBugs: 1 }, 1),
    unknown: 0, open: [], from: '2026-06-01', to: '2026-09-04',
    summary: 'Tests du plan de migration / Migration plan tests',
    demonstrates: 'une cohorte trop petite pour conclure',
  },
  {
    id: 'e2-trial-ext-m', epochId: EPOCH_2, nature: 'external-integration', zone: 'api', size: 'M',
    agent: arm(5, 4, 48, { causedBugs: 1 }, 1),
    human: humanArm(4, 3, 56, { causedBugs: 1, incidents: 1 }, 1),
    unknown: 0, open: [], from: '2026-06-08', to: '2026-09-04',
    summary: 'Raccordement du service de signature / Signature service hookup',
    classifiedBy: 'model', sizeEstimated: true, description: 'none',
    demonstrates: 'la cohorte sur laquelle l\'essai contrôlé a porté',
  },
  {
    id: 'e2-grey-ext-s', epochId: EPOCH_2, nature: 'external-integration', zone: 'api', size: 'S',
    agent: arm(4, 3, 40, { causedBugs: 1 }, 1),
    human: humanArm(3, 3, 44, {}, 1),
    unknown: 0, open: [], from: '2026-06-15', to: '2026-09-04',
    summary: 'Ajustement du connecteur / Connector tweak',
    demonstrates: 'une cohorte trop petite pour conclure',
  },
  {
    id: 'e3-bugfix-m', epochId: EPOCH_3, nature: 'bugfix', zone: 'api', size: 'M',
    agent: arm(18, 15, 26, { causedBugs: 3, incidents: 1 }, 1),
    human: humanArm(16, 14, 38, { reopened: 1, causedBugs: 1 }, 1),
    unknown: 0, open: [], from: '2026-09-16', to: '2026-09-30',
    summary: 'Correction du panier / Cart fix',
    demonstrates: 'le nouveau modèle de l\'époque 3',
  },
  {
    id: 'e3-trial-ext-m', epochId: EPOCH_3, nature: 'external-integration', zone: 'api', size: 'M',
    agent: arm(5, 4, 50, { causedBugs: 1 }, 1),
    human: humanArm(5, 4, 58, { causedBugs: 1, incidents: 1 }, 1),
    unknown: 0, open: [], from: '2026-10-05', to: '2026-10-19',
    summary: 'Raccordement du service de signature / Signature service hookup',
    classifiedBy: 'model', sizeEstimated: true, labels: ['trial'],
    demonstrates: 'la cohorte de l\'essai contrôlé en cours',
  },
  {
    id: 'e3-ui-s', epochId: EPOCH_3, nature: 'ui-change', zone: 'web-ui', size: 'S',
    agent: arm(7, 6, 18, { causedBugs: 1, incidents: 1 }, 1),
    human: humanArm(5, 4, 22, { causedBugs: 1 }, 1),
    unknown: 0, open: [], from: '2026-10-08', to: '2026-11-28',
    summary: 'Affichage du reçu / Receipt display',
    demonstrates: 'des tickets encore ouverts : le délai n\'est pas fini',
  },
  {
    id: 'e3-nocode', epochId: EPOCH_3, nature: 'no-code', zone: 'api', size: 'S',
    agent: arm(2, 2, 6, {}),
    human: humanArm(3, 2, 8, { causedBugs: 1 }, 1),
    unknown: 2, open: [], from: '2026-10-12', to: '2026-11-12',
    summary: 'Documentation du module / Module documentation', labels: ['documentation'],
    demonstrates: 'les tickets sans commit : une nature à part, hors des cohortes de code',
  },
  {
    id: 'e3-caused-bugs', epochId: EPOCH_3, nature: 'bugfix', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 12, open: [], from: '2026-11-02', to: '2026-11-27',
    summary: 'Bugs signalés après la livraison / Bugs reported after the release', labels: ['bug'],
    demonstrates: 'les bugs que les liens pointent : bugs à la suite et bugs voisins',
  },
  {
    id: 'e3-showcase', epochId: EPOCH_3, nature: 'external-integration', zone: 'api', size: 'M',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 0, open: OPEN_SHOWCASE, from: '2026-11-01', to: '2026-11-28',
    summary: 'Tickets ouverts de la démonstration / Open tickets of the demo',
    demonstrates: 'les tickets ouverts : incident, zone sensible, critères manquants, essai',
  },
  {
    id: 'e1-unknown-config', epochId: EPOCH_1, nature: 'configuration', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 30, open: [], from: '2026-01-13', to: '2026-04-03',
    summary: 'Réglages d\'exploitation / Operational settings', sizeEstimated: true,
    demonstrates: 'implication inconnue : le ticket n\'est ni avec agent ni sans agent',
  },
  {
    id: 'e1-unknown-ui-web', epochId: EPOCH_1, nature: 'ui-change', zone: 'web-ui', size: 'S',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 90, open: [], from: '2026-01-20', to: '2026-03-27',
    summary: 'Retouche de l\'interface / Interface polish', sizeEstimated: true,
    demonstrates: 'implication inconnue : le ticket n\'est ni avec agent ni sans agent',
  },
  {
    id: 'e2-unknown-config', epochId: EPOCH_2, nature: 'configuration', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 520, open: [], from: '2026-04-06', to: '2026-09-13',
    summary: 'Réglages d\'exploitation / Operational settings', sizeEstimated: true,
    demonstrates: 'implication inconnue : le ticket n\'est ni avec agent ni sans agent',
  },
  {
    id: 'e2-unknown-refactor-web', epochId: EPOCH_2, nature: 'refactor', zone: 'web-ui', size: 'M',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 130, open: [], from: '2026-04-20', to: '2026-09-13',
    summary: 'Reprise de l\'interface / Interface rework', sizeEstimated: true,
    demonstrates: 'implication inconnue : le ticket n\'est ni avec agent ni sans agent',
  },
  {
    id: 'e2-unknown-tests-web', epochId: EPOCH_2, nature: 'tests', zone: 'web-ui', size: 'M',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 180, open: [], from: '2026-05-05', to: '2026-09-09',
    summary: 'Tests du parcours de paiement / Payment path tests', sizeEstimated: true,
    demonstrates: 'implication inconnue : le ticket n\'est ni avec agent ni sans agent',
  },
  {
    id: 'e3-unknown-config', epochId: EPOCH_3, nature: 'configuration', zone: 'api', size: 'S',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 60, open: [], from: '2026-09-14', to: '2026-11-20',
    summary: 'Réglages d\'exploitation / Operational settings', sizeEstimated: true,
    demonstrates: 'implication inconnue : le ticket n\'est ni avec agent ni sans agent',
  },
  {
    id: 'e3-unknown-ui-web', epochId: EPOCH_3, nature: 'ui-change', zone: 'web-ui', size: 'S',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 40, open: [], from: '2026-09-20', to: '2026-11-25',
    summary: 'Retouche de l\'interface / Interface polish', sizeEstimated: true,
    demonstrates: 'implication inconnue : le ticket n\'est ni avec agent ni sans agent',
  },
  {
    id: 'e3-unknown-tests-web', epochId: EPOCH_3, nature: 'tests', zone: 'web-ui', size: 'M',
    agent: arm(0, 0, 0, {}),
    human: humanArm(0, 0, 0, {}),
    unknown: 134, open: [], from: '2026-09-16', to: '2026-11-28',
    summary: 'Tests du parcours de paiement / Payment path tests', sizeEstimated: true,
    demonstrates: 'implication inconnue : le ticket n\'est ni avec agent ni sans agent',
  },
];

/** Every scenario of the base: the ten of the brief, then the material around them. */
export const ALL_SCENARIOS: readonly Scenario[] = [...SCENARIOS, ...FILLERS];

/** The scenario of one family id, when the base declares one. */
export function scenarioOf(familyId: string): Scenario | undefined {
  return ALL_SCENARIOS.find((scenario) => scenario.id === familyId);
}
