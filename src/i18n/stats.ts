/**
 * Messages of the honest statistics (SPEC §6 "Délai", §7 rule 3, §20;
 * DP-08, DP-24, recipe 10).
 *
 * One format for every rate: the rate, its sample size and its 95 % interval,
 * always together. A screen never receives a bare rate to display (recipe 10).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** English messages of the statistics domain. */
export const STATS_EN = {
  'stats.rate': '{rate} (n = {n}, 95 % interval [{low} ; {high}])',
  'stats.interval': '[{low} ; {high}]',
  'stats.sample': 'n = {n}',
  'stats.median': '{hours} h (n = {n})',
  'stats.none': 'no ticket',
  'stats.delegable-share': '{share} of the points of sprint {sprint} are to be entrusted to an agent',
  'stats.grey-share': '{share} of the cells are grey: we do not know',
  'stats.sprint-count': '{count} tickets can be entrusted to an agent in this sprint',
  'stats.sprint-empty': 'No ticket of this sprint can be entrusted to an agent yet',
  'stats.review-load': '{count} review actions (reviewers, changes requested, comments)',
  'stats.no-sprint': 'No sprint given: the delegable share is not computed',
} as const;

/** French messages of the statistics domain (same keys, exact parity). */
export const STATS_FR = {
  'stats.rate': '{rate} (n = {n}, intervalle à 95 % [{low} ; {high}])',
  'stats.interval': '[{low} ; {high}]',
  'stats.sample': 'n = {n}',
  'stats.median': '{hours} h (n = {n})',
  'stats.none': 'aucun ticket',
  'stats.delegable-share': '{share} des points du sprint {sprint} sont à confier à un agent',
  'stats.grey-share': '{share} des cases sont grises : on ne sait pas',
  'stats.sprint-count': '{count} tickets peuvent être confiés à un agent dans ce sprint',
  'stats.sprint-empty': "Aucun ticket de ce sprint ne peut être confié à un agent pour l'instant",
  'stats.review-load': '{count} actions de relecture (relecteurs, changements demandés, commentaires)',
  'stats.no-sprint': "Aucun sprint indiqué : la part délégable n'est pas calculée",
} as const;
