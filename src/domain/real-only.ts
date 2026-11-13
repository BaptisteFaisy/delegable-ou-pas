/**
 * Le mode « sans données fictives » : ce que l'app peut dire quand la seule
 * source est la **télémétrie réelle**, sans le jeu de démonstration.
 *
 * La méthode de l'app (cahier des charges §7) repose sur une comparaison :
 * deux bras, un même ticket traité par un agent et par un humain, un issue
 * mesuré. Sur la télémétrie réelle du poste, **aucun de ces trois éléments
 * n'existe** : on sait qu'un agent a travaillé sur 25 sessions (5 tickets),
 * on ne sait pas ce qu'un humain aurait fait sur les mêmes tickets, et on ne
 * sait pas si le travail a tenu.
 *
 * Ce module ne bricole pas une réponse : il mesure ce qui manque et le dit.
 * C'est la version honnête du produit — celle qui vaut mieux qu'une démo
 * flatteuse.
 *
 * Module pur : aucune horloge, aucun disque, aucun réseau.
 */
import type { SessionReelle } from '../collect/session-reelle.js';

/** L'issue d'une session : mesurée, ou inconnue. */
export type Issue = 'propre' | 'repris' | 'inconnu';

/** Une session à laquelle on a pu—or non—mesurer l'issue. */
export interface SessionVerifiable extends SessionReelle {
  readonly issue: Issue;
}

/** Les raisons pour lesquelles un ticket ne peut pas être décidé. */
export type Blocage = 'pas-de-bras-humain' | 'issue-inconnu' | 'cohorte-trop-petite';

/** Le bilan du mode réel. */
export interface BilanRealOnly {
  readonly sessions: number;
  readonly sessionsAvecTicket: number;
  readonly tickets: number;
  readonly ticketsObservables: number;
  readonly ticketsDecidables: number;
  readonly conclusion: 'insuffisant' | 'partiel' | 'exploitable';
  readonly blocages: readonly Blocage[];
}

/** Le nombre de sessions qu'il faut pour qu'une cohorte dise quelque chose. */
export const MIN_SESSIONS_PAR_TICKET = 2;

/**
 * Ce que le mode réel sait dire, et ce qu'il ne peut pas dire.
 *
 * Un ticket est **observable** quand au moins une session lui est rattachée :
 * on peut alors affirmer « un agent a travaillé là ». Il n'est **décidable**
 * que si la comparaison est possible — donc s'il y a un bras humain observé
 * (jamais le cas sur la télémétrie) et un issue mesuré.
 */
export function bilanRealOnly(sessions: readonly SessionVerifiable[]): BilanRealOnly {
  const parTicket = new Map<string, SessionVerifiable[]>();
  for (const session of sessions) {
    if (!session.cleTicket) continue;
    const lot = parTicket.get(session.cleTicket) ?? [];
    lot.push(session);
    parTicket.set(session.cleTicket, lot);
  }
  const blocages = new Set<Blocage>();
  let decidables = 0;
  for (const lot of parTicket.values()) {
    const issues = lot.filter((session) => session.issue !== 'inconnu').length;
    const brasHumain = lot.some((session) => session.agent === '' || session.agent === 'human');
    if (lot.length < MIN_SESSIONS_PAR_TICKET) blocages.add('cohorte-trop-petite');
    if (issues === 0) blocages.add('issue-inconnu');
    if (!brasHumain) blocages.add('pas-de-bras-humain');
    if (lot.length >= MIN_SESSIONS_PAR_TICKET && issues > 0 && brasHumain) decidables += 1;
  }
  const conclusion: BilanRealOnly['conclusion'] = decidables === 0
    ? 'insuffisant'
    : decidables < parTicket.size ? 'partiel' : 'exploitable';
  return {
    sessions: sessions.length,
    sessionsAvecTicket: sessions.filter((session) => session.cleTicket !== null).length,
    tickets: parTicket.size,
    ticketsObservables: parTicket.size,
    ticketsDecidables: decidables,
    conclusion,
    blocages: [...blocages].sort(),
  };
}

/** Ce qu'il faudrait pour que le mode réel décide de quelque chose. */
export function besoinsPourDecider(bilan: BilanRealOnly): string[] {
  const besoins: string[] = [];
  if (bilan.blocages.includes('pas-de-bras-humain')) {
    besoins.push('observer un bras humain sur les mêmes tickets');
  }
  if (bilan.blocages.includes('issue-inconnu')) {
    besoins.push('mesurer l’issue de chaque session (propre, repris)');
  }
  if (bilan.blocages.includes('cohorte-trop-petite')) {
    besoins.push(`au moins ${MIN_SESSIONS_PAR_TICKET} sessions par ticket`);
  }
  return besoins;
}
