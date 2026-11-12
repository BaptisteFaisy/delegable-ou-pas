/**
 * Messages of the actions the screens offer and of the nine MCP tools
 * (SPEC §8 "Un avis, pas un ordre", §9, §15; DP-01, DP-13, DP-15).
 *
 * The decision is never a judgement on a person: the wording says what was
 * decided and whether the advice was followed, nothing more (DP-13).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** English messages of the actions and tools. */
export const ACTIONS_EN = {
  'action.delegate': 'Hand it to an agent',
  'action.keep-human': 'Keep it for a human',
  'action.follow-advice': 'Follow the advice',
  'action.record-decision': 'Record the decision',
  'action.report-takeover': 'Report a human takeover',
  'action.reason': 'Reason',
  'action.cancel': 'Cancel',
  'action.confirm': 'Confirm',
  'action.decision-taken': 'Decision taken: {decision}',
  'action.decision-followed': 'The advice was followed',
  'action.decision-not-followed': 'The advice was not followed',
  'action.takeover-reported': 'Human takeover reported: the ticket fell back to {level}',
  'action.level.none': 'without an agent',
  'action.level.assisted': 'assisted by an agent',
  'action.level.driven': 'driven by an agent',
  'action.level.autonomous': 'done by an agent alone',
  'action.level.unknown': 'unknown involvement',
  'action.source.mcp-declaration': 'declared by the tool',
  'action.source.bot-author': 'robot author of the commit',
  'action.source.commit-mention': 'mention in a commit message',
  'action.source.closure-field': 'field filled at closure',
  'action.source.adoption-date': 'declared adoption date',
  'tool.should-delegate': 'Should this ticket be delegated?',
  'tool.list-delegable-work': 'Work an agent may take',
  'tool.get-delegation-evidence': 'Evidence behind the advice',
  'tool.get-delegation-map': 'Delegation map',
  'tool.get-cohort': 'Cohort detail',
  'tool.get-calibration': 'Calibration',
  'tool.record-involvement': 'Record an involvement',
  'tool.record-decision': 'Record a decision',
  'tool.report-takeover': 'Report a takeover',
} as const;

/** French messages of the actions and tools (same keys, exact parity). */
export const ACTIONS_FR = {
  'action.delegate': 'Confier à un agent',
  'action.keep-human': 'Garder pour un humain',
  'action.follow-advice': "Suivre l'avis",
  'action.record-decision': 'Enregistrer la décision',
  'action.report-takeover': 'Signaler une reprise humaine',
  'action.reason': 'Motif',
  'action.cancel': 'Annuler',
  'action.confirm': 'Confirmer',
  'action.decision-taken': 'Décision prise : {decision}',
  'action.decision-followed': "L'avis a été suivi",
  'action.decision-not-followed': "L'avis n'a pas été suivi",
  'action.takeover-reported': 'Reprise humaine signalée : le ticket retombe au niveau {level}',
  'action.level.none': 'sans agent',
  'action.level.assisted': 'assisté par un agent',
  'action.level.driven': 'piloté par un agent',
  'action.level.autonomous': 'fait par un agent seul',
  'action.level.unknown': 'implication inconnue',
  'action.source.mcp-declaration': "déclarée par l'outil",
  'action.source.bot-author': 'auteur robot du commit',
  'action.source.commit-mention': 'mention dans un message de commit',
  'action.source.closure-field': 'champ rempli à la clôture',
  'action.source.adoption-date': "date d'adoption déclarée",
  'tool.should-delegate': 'Ce ticket est-il délégable ?',
  'tool.list-delegable-work': 'Travail qu\'un agent peut prendre',
  'tool.get-delegation-evidence': "Preuves derrière l'avis",
  'tool.get-delegation-map': 'Carte de délégation',
  'tool.get-cohort': 'Détail de la cohorte',
  'tool.get-calibration': 'Calibration',
  'tool.record-involvement': 'Enregistrer une implication',
  'tool.record-decision': 'Enregistrer une décision',
  'tool.report-takeover': 'Signaler une reprise',
} as const;
