/**
 * Le mode « sans données fictives », rendu pour l'interface : le bilan
 * chiffré, et surtout la liste de ce qui **manque** pour décider.
 *
 * Le domaine (`src/domain/real-only.ts`) mesure ; ce module met en forme, en
 * français et en anglais, comme tous les viewmodels du dépôt.
 */
import { bilanRealOnly, besoinsPourDecider } from '../domain/real-only.js';
import type { Blocage, SessionVerifiable } from '../domain/real-only.js';

interface Bilingual { readonly fr: string; readonly en: string }

/** Ce que l'app sait, et ce qu'il ne sait pas encore. */
export interface VueModeleRealOnly {
  readonly label: Bilingual;
  readonly summary: Bilingual;
  readonly mention: Bilingual;
  readonly sessions: number;
  readonly sessionsAvecTicket: number;
  readonly tickets: number;
  readonly ticketsDecidables: number;
  readonly conclusion: Bilingual;
  readonly blocages: readonly Bilingual[];
  readonly besoins: readonly Bilingual[];
}

/** Les libellés d'un blocage. */
const LIBELLES_BLOCAGE: Record<Blocage, Bilingual> = {
  'pas-de-bras-humain': {
    fr: 'aucun bras humain observé sur les mêmes tickets',
    en: 'no human arm observed on the same tickets',
  },
  'issue-inconnu': {
    fr: 'aucun issue mesuré (le travail a-t-il tenu ?)',
    en: 'no measured outcome (did the work hold?)',
  },
  'cohorte-trop-petite': {
    fr: 'cohortes trop petites pour dire quelque chose',
    en: 'cohorts too small to say anything',
  },
};

/** Les libellés d'un besoin. */
const LIBELLES_BESOIN: Record<string, Bilingual> = {
  'observer un bras humain sur les mêmes tickets': {
    fr: 'Observer un bras humain sur les mêmes tickets',
    en: 'Observe a human arm on the same tickets',
  },
  'mesurer l’issue de chaque session (propre, repris)': {
    fr: 'Mesurer l’issue de chaque session (propre, repris)',
    en: 'Measure the outcome of each session (clean, reopened)',
  },
  'au moins 2 sessions par ticket': {
    fr: 'Au moins 2 sessions par ticket',
    en: 'At least 2 sessions per ticket',
  },
};

/** Le libellé d'une conclusion. */
function libelleConclusion(conclusion: 'insuffisant' | 'partiel' | 'exploitable'): Bilingual {
  if (conclusion === 'exploitable') {
    return { fr: 'la donnée réelle suffit à décider', en: 'the real data is enough to decide' };
  }
  if (conclusion === 'partiel') {
    return { fr: 'la donnée réelle permet de décider, mais pas partout', en: 'the real data allows a decision, but not everywhere' };
  }
  return {
    fr: 'la donnée réelle ne permet pas encore de décider',
    en: 'the real data does not allow a decision yet',
  };
}

/** Le mode réel, rendu. */
export function vueModeleRealOnly(sessions: readonly SessionVerifiable[]): VueModeleRealOnly {
  const bilan = bilanRealOnly(sessions);
  return {
    label: {
      fr: 'Le mode sans données fictives',
      en: 'The mode without fictional data',
    },
    summary: {
      fr: `Sur la seule télémétrie réelle du poste — ${bilan.sessions} sessions, dont `
        + `${bilan.sessionsAvecTicket} rattachées à ${bilan.tickets} tickets — l'application ne `
        + `peut décider de rien : il n'existe ni bras humain observé sur les mêmes tickets, ni issue `
        + `mesurée. Elle le dit, plutôt que de comparer des chiffres qu'elle n'a pas.`,
      en: `On the workstation's real telemetry alone — ${bilan.sessions} sessions, ${bilan.sessionsAvecTicket} `
        + `of them attached to ${bilan.tickets} tickets — the application can decide nothing: there is `
        + `neither an observed human arm on the same tickets, nor a measured outcome. It says so, `
        + `rather than comparing figures it does not have.`,
    },
    mention: {
      fr: 'donnée réelle, aucune fiction',
      en: 'real data, no fiction',
    },
    sessions: bilan.sessions,
    sessionsAvecTicket: bilan.sessionsAvecTicket,
    tickets: bilan.tickets,
    ticketsDecidables: bilan.ticketsDecidables,
    conclusion: libelleConclusion(bilan.conclusion),
    blocages: bilan.blocages.map((code) => LIBELLES_BLOCAGE[code]),
    besoins: besoinsPourDecider(bilan).map((besoin) => LIBELLES_BESOIN[besoin] ?? { fr: besoin, en: besoin }),
  };
}
