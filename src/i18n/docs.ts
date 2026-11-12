/**
 * Messages that explain the method on the screens (SPEC §7, §10, §11, §12,
 * §13, §16.5, §16.7; DP-02, DP-10, DP-20, DP-21, DP-22, DP-26).
 *
 * These are the sentences that keep the vocabulary honest: "proven" is
 * reserved for the controlled trial, "established gap" means disjoint
 * intervals, and a total is never shown without its decomposition (SPEC §7
 * rule 7, SPEC §21).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** English messages of the method and of the settings. */
export const DOCS_EN = {
  'docs.proven-reserved': 'The word "proven" is reserved for a controlled trial: an observed cohort is never proven',
  'docs.established-gap': '"Established gap" means the two intervals do not overlap',
  'docs.not-established-gap': '"Gap not established" means the intervals overlap: the app does not conclude',
  'docs.total-decomposed': 'A total is never shown alone: the matrix below decomposes it cohort by cohort',
  'docs.demo-dataset': 'Demonstration dataset: the figures are invented to show the method',
  'docs.epoch': 'An epoch is a period during which the team\'s agents did not change',
  'docs.outdated-epoch': 'The figures of an outdated epoch are shown but greyed out',
  'docs.hardened-review': 'Hardened review means: {label}',
  'docs.hardened-review.reviewers': 'at least {count} reviewers',
  'docs.hardened-review.zone-owner': 'a reviewer responsible for the zone is required',
  'docs.hardened-review.evidence': 'one evidence per acceptance criterion',
  'docs.min-arm-size': 'The app refuses to conclude below {n} tickets per arm',
  'docs.adoption-date': 'Date of adoption: {date}',
  'docs.no-adoption-date': 'No adoption date declared: the tickets are not split by it',
  'docs.sensitive-zones': 'Sensitive zones, where handing work to an agent is forbidden',
  'docs.no-sensitive-zone': 'No sensitive zone declared',
  'docs.natures': 'Natures of work declared by the project',
  'docs.zones': 'Zones of the codebase declared by the project',
  'docs.sizes': 'Sizes of tickets declared by the project',
  'docs.waiting-statuses': 'Statuses that do not count in the delay',
  'docs.commit-mentions': 'Catalogue of commit mentions',
  'docs.commit-mention': '{agent} — seen {count} times',
  'docs.commit-mention.disabled': '{agent} — disabled',
  'docs.commit-mentions-to-confirm': 'Mentions really seen, to confirm',
  'docs.no-commit-mention': 'No commit mention in the catalogue yet',
  'docs.calibration-warning': 'The advice brings nothing measurable here: "hand it to an agent" does not clearly beat "keep it for a human"',
  'docs.calibration-intro': 'How right the past recommendations were, recommendation by recommendation',
  'docs.calibration-empty': 'No recommendation has been followed long enough to be calibrated yet',
  'docs.failure-causes': 'What went wrong with an agent, in plain words',
} as const;

/** French messages of the method and of the settings (same keys, exact parity). */
export const DOCS_FR = {
  'docs.proven-reserved': "Le mot « prouvé » est réservé à l'essai contrôlé : une cohorte observée n'est jamais prouvée",
  'docs.established-gap': '« Écart établi » veut dire que les deux fourchettes ne se chevauchent pas',
  'docs.not-established-gap': "« Écart non établi » veut dire que les fourchettes se chevauchent : l'app ne conclut pas",
  'docs.total-decomposed': "Un total n'est jamais montré seul : la matrice ci-dessous le décompose cohorte par cohorte",
  'docs.demo-dataset': 'Jeu de démonstration : les chiffres sont inventés pour montrer la méthode',
  'docs.epoch': "Une époque est une période pendant laquelle les agents de l'équipe n'ont pas changé",
  'docs.outdated-epoch': "Les chiffres d'une époque dépassée sont affichés mais grisés",
  'docs.hardened-review': 'La relecture renforcée veut dire : {label}',
  'docs.hardened-review.reviewers': 'au moins {count} relecteurs',
  'docs.hardened-review.zone-owner': 'un relecteur responsable de la zone est exigé',
  'docs.hardened-review.evidence': "une preuve par critère d'acceptation",
  'docs.min-arm-size': "L'app refuse de conclure sous {n} tickets par bras",
  'docs.adoption-date': "Date d'adoption : {date}",
  'docs.no-adoption-date': "Aucune date d'adoption déclarée : les tickets ne sont pas découpés par elle",
  'docs.sensitive-zones': "Zones sensibles, où confier le travail à un agent est interdit",
  'docs.no-sensitive-zone': 'Aucune zone sensible déclarée',
  'docs.natures': 'Natures de travail déclarées par le projet',
  'docs.zones': 'Zones du code déclarées par le projet',
  'docs.sizes': 'Tailles de tickets déclarées par le projet',
  'docs.waiting-statuses': 'Statuts qui ne comptent pas dans le délai',
  'docs.commit-mentions': 'Catalogue des mentions de commit',
  'docs.commit-mention': '{agent} — vue {count} fois',
  'docs.commit-mention.disabled': '{agent} — désactivée',
  'docs.commit-mentions-to-confirm': 'Mentions réellement vues, à confirmer',
  'docs.no-commit-mention': 'Aucune mention de commit dans le catalogue pour le moment',
  'docs.calibration-warning': "L'avis n'apporte rien de mesurable ici : « à confier à un agent » ne l'emporte pas clairement sur « à garder pour un humain »",
  'docs.calibration-intro': 'À quel point les recommandations passées avaient raison, recommandation par recommandation',
  'docs.calibration-empty': "Aucune recommandation n'a encore été suivie assez longtemps pour être calibrée",
  'docs.failure-causes': "Ce qui a mal tourné avec un agent, en mots simples",
} as const;
