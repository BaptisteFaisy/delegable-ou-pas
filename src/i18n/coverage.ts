/**
 * Messages of the coverage screen (SPEC §16.6, §19; DP-19, recipe 15).
 *
 * A missing right is said out loud, never hidden behind a silent zero: the
 * screen names each right on the graph and its state (recipe 15).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** English messages of the coverage screen. */
export const COVERAGE_EN = {
  'coverage.title': 'Coverage of the data',
  'coverage.known-involvement': 'Known involvement: {rate}',
  'coverage.no-known-involvement': 'No ticket has a known involvement yet',
  'coverage.permissions': 'State of each right on the graph',
  'coverage.permission.commit': 'Reading the commits',
  'coverage.permission.pull-request': 'Reading the pull requests',
  'coverage.permission.issue': 'Reading the issues',
  'coverage.permission.user': 'Reading the accounts (to count people, never to name them)',
  'coverage.permission.granted': 'granted',
  'coverage.permission.missing': 'missing: the figures below are emptied, not zeroed',
  'coverage.permission.unknown': 'unknown: not tested yet',
  'coverage.last-collection': 'Last collection: {at}',
  'coverage.last-collection.none': 'No collection has run yet',
  'coverage.last-collection.failed': 'The last collection ended on an error',
  'coverage.partial': 'The figures are partial: at least one right on the graph is missing',
} as const;

/** French messages of the coverage screen (same keys, exact parity). */
export const COVERAGE_FR = {
  'coverage.title': 'Couverture des données',
  'coverage.known-involvement': 'Implication connue : {rate}',
  'coverage.no-known-involvement': "Aucun ticket n'a encore d'implication connue",
  'coverage.permissions': 'État de chaque droit sur le graphe',
  'coverage.permission.commit': 'Lecture des commits',
  'coverage.permission.pull-request': 'Lecture des pull requests',
  'coverage.permission.issue': 'Lecture des tickets',
  'coverage.permission.user': 'Lecture des comptes (pour compter les personnes, jamais pour les nommer)',
  'coverage.permission.granted': 'accordé',
  'coverage.permission.missing': 'manquant : les chiffres ci-dessous sont vidés, pas mis à zéro',
  'coverage.permission.unknown': 'inconnu : pas encore testé',
  'coverage.last-collection': 'Dernière collecte : {at}',
  'coverage.last-collection.none': "Aucune collecte n'a encore eu lieu",
  'coverage.last-collection.failed': "La dernière collecte s'est terminée sur une erreur",
  'coverage.partial': 'Les chiffres sont partiels : au moins un droit sur le graphe manque',
} as const;
